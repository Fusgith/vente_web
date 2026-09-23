import { createHmac, randomBytes } from 'node:crypto';

import {
  isRemoteRole,
  type AccessOrigin,
  type AuthMe,
  type AuthMethod,
  type LoginBody,
  type Role,
} from '@vente-web/shared';
import type { FastifyBaseLogger } from 'fastify';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { StationType } from '../generated/prisma/enums.js';
import { recordAudit } from './audit.js';
import {
  clearLoginFailures,
  recordLoginFailure,
  reserveLoginAttempt,
  unspentTotpStep,
} from './lockout.js';
import { verifySecret } from './password-hash.js';
import {
  createSession,
  idleMinutesFor,
  purgeExpiredSessions,
  toAuthMe,
  type AuthContext,
} from './sessions.js';
import { verifyTotp } from './totp.js';

export interface LoginShape {
  method: 'PIN' | 'PASSWORD';
  role: Role;
  hasTotp: boolean;
}

/**
 * Rules decided from the request alone, before any account lookup (nothing to enumerate):
 * PIN only in the shop and only for operational roles (RG-USR-03), operational roles never
 * remote (T3), owner/admin remote only with password + TOTP (RG-USR-04).
 */
export function loginShapeError(shape: LoginShape, origin: AccessOrigin): AppError | null {
  if (shape.method === 'PIN' && (origin === 'REMOTE' || isRemoteRole(shape.role))) {
    return new AppError(403, 'AUTH_PIN_LAN_ONLY');
  }
  if (origin === 'REMOTE') {
    if (!isRemoteRole(shape.role)) return new AppError(403, 'AUTH_ROLE_REMOTE_FORBIDDEN');
    if (!shape.hasTotp) return new AppError(401, 'AUTH_TOTP_REQUIRED');
  }
  return null;
}

/** A station serves one kind of work; managers and above may use any of them (⚠️ H21). */
export function stationAcceptsRole(stationType: StationType, role: Role): boolean {
  switch (stationType) {
    case 'SALES':
      return role === 'sales' || isSupervisor(role);
    case 'REGISTER':
      return role === 'cashier' || isSupervisor(role);
    case 'DELIVERY':
      return role === 'warehouse' || isSupervisor(role);
    case 'DISPLAY':
      return false;
  }
}

function isSupervisor(role: Role): boolean {
  return role === 'manager' || role === 'admin' || role === 'owner';
}

/** Per-process key: digests match within one run of the server, never across logs. */
const USERNAME_DIGEST_KEY = randomBytes(32);

/**
 * What the application log gets instead of an unknown username: a name typed in the wrong
 * field is often a password. The keyed digest still lets one spot a repeated guess, but a
 * leaked log cannot be matched against a dictionary of candidate passwords.
 */
export function usernameDigest(username: string): string {
  return createHmac('sha256', USERNAME_DIGEST_KEY).update(username).digest('hex').slice(0, 16);
}

export interface LoginDeps {
  db: Db;
  sessionHours: number;
  log: FastifyBaseLogger;
}

export interface LoginResult {
  token: string;
  me: AuthMe;
}

function toShape(body: LoginBody): LoginShape {
  return 'pin' in body
    ? { method: 'PIN', role: body.role, hasTotp: false }
    : { method: 'PASSWORD', role: body.role, hasTotp: body.totp !== undefined };
}

/**
 * Full login flow: one argon2 verification per call, generic 401 on every credential failure.
 * A known account costs one attempt slot before its secret is looked at (RG-USR-05).
 */
export async function login(
  deps: LoginDeps,
  body: LoginBody,
  origin: AccessOrigin,
  now = new Date(),
): Promise<LoginResult> {
  const { db } = deps;
  const shape = toShape(body);
  const shapeError = loginShapeError(shape, origin);
  if (shapeError) throw shapeError;

  const station = body.stationId
    ? await db.station.findUnique({
        where: { id: body.stationId },
        select: { id: true, type: true, isActive: true },
      })
    : null;
  if (body.stationId && (!station?.isActive || !stationAcceptsRole(station.type, body.role))) {
    throw new AppError(400, 'STATION_INVALID');
  }

  const invalid = new AppError(401, 'AUTH_INVALID_CREDENTIALS');
  const secret = 'pin' in body ? body.pin : body.password;
  const user = await db.user.findUnique({ where: { username: body.username } });
  if (!user) {
    // Same cost as a real verification: no timing oracle on account existence.
    await verifySecret(null, secret);
    deps.log.info(
      { usernameDigest: usernameDigest(body.username), origin },
      'login failed: unknown username',
    );
    throw invalid;
  }

  const reservation = await reserveLoginAttempt(db, user.id);
  if (!reservation.allowed) {
    await verifySecret(null, secret);
    const { retryAfterSeconds } = reservation;
    deps.log.warn({ userId: user.id, origin, retryAfterSeconds }, 'login refused: account locked');
    // The lock is visible in the shop (RG-USR-05); outside, nothing distinguishes the account.
    if (origin === 'LAN') throw new AppError(423, 'AUTH_LOCKED', { retryAfterSeconds });
    throw invalid;
  }
  const { slot } = reservation;
  const failureContext = { origin, role: body.role, stationId: station?.id ?? null };
  const fail = async (reason: string): Promise<never> => {
    await recordLoginFailure(db, user.id, slot, { ...failureContext, reason });
    throw invalid;
  };

  const storedHash = shape.method === 'PIN' ? user.pinHash : user.passwordHash;
  if (!(await verifySecret(storedHash, secret))) return fail('invalid_secret');
  if (!user.isActive) return fail('inactive');
  if (!user.roles.includes(body.role)) return fail('role_not_held');

  let authMethod: AuthMethod = shape.method;
  let totpStep: number | undefined;
  if ('totp' in body && body.totp !== undefined) {
    if (!user.totpSecret || !user.totpEnabledAt) {
      // Outside, the account stays indistinguishable from one with a wrong code; in the shop
      // the password was right and the message helps: enrol first.
      if (origin === 'REMOTE') return fail('totp_not_enrolled');
      await clearLoginFailures(db, user.id);
      throw new AppError(403, 'AUTH_TOTP_NOT_ENROLLED');
    }
    const step = verifyTotp(user.totpSecret, body.totp, {
      lastStep: user.totpLastStep,
      now: now.getTime(),
    });
    if (step === null) return fail('totp_invalid');
    totpStep = step;
    authMethod = 'PASSWORD_TOTP';
  }

  // The step is spent and the counter reset in one statement: a replayed code loses the race.
  const cleared = await clearLoginFailures(
    db,
    user.id,
    totpStep === undefined
      ? {}
      : { where: unspentTotpStep(totpStep), data: { totpLastStep: totpStep } },
  );
  if (!cleared) return fail('totp_replayed');

  const created = await db.$transaction(async (tx) => {
    await purgeExpiredSessions(tx, user.id, now);
    const session = await createSession(tx, {
      userId: user.id,
      activeRole: body.role,
      stationId: station?.id ?? null,
      origin,
      authMethod,
      ttlHours: deps.sessionHours,
      now,
    });
    await recordAudit(tx, {
      userId: user.id,
      activeRole: body.role,
      stationId: station?.id ?? null,
      origin,
      action: 'auth.login',
      entityType: 'session',
      entityId: session.id,
      after: { authMethod },
    });
    return session;
  });

  const auth: AuthContext = {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles,
      totpEnabled: user.totpEnabledAt !== null,
    },
    session: {
      id: created.id,
      activeRole: body.role,
      origin,
      authMethod,
      stationId: station?.id ?? null,
      stationType: station?.type ?? null,
      expiresAt: created.expiresAt,
    },
    idleMinutes: await idleMinutesFor(db, origin, station?.type),
  };
  return { token: created.token, me: toAuthMe(auth) };
}
