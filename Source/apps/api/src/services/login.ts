import { createHmac, randomBytes } from 'node:crypto';

import {
  isRemoteRole,
  ROLES,
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
import { hashSecret, verifySecret } from './password-hash.js';
import {
  createSession,
  idleMinutesFor,
  purgeExpiredSessions,
  replaceSessions,
  toAuthMe,
  type AuthContext,
} from './sessions.js';
import { verifyTotp } from './totp.js';

/** A station serves one kind of work; managers and above may use any of them (H21). */
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

/**
 * The role a login opens, nothing being chosen on the login screen (RG-USR-02, H57): outside the
 * shop a remote role (RG-USR-04, T3); on a paired station the work it serves, else a supervisor
 * role it accepts; otherwise the account's first role in `ROLES` order. Null: none fits.
 */
export function openingRole(
  roles: readonly Role[],
  origin: AccessOrigin,
  stationType: StationType | null,
): Role | null {
  const held = ROLES.filter((role) => roles.includes(role));
  if (origin === 'REMOTE') return held.find(isRemoteRole) ?? null;
  if (stationType === null) return held[0] ?? null;
  const accepted = held.filter((role) => stationAcceptsRole(stationType, role));
  return accepted.find((role) => !isSupervisor(role)) ?? accepted[0] ?? null;
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
  // Decided from the request alone, before any account lookup (nothing to enumerate).
  if (origin === 'REMOTE' && body.totp === undefined) throw new AppError(401, 'AUTH_TOTP_REQUIRED');

  const station = body.stationId
    ? await db.station.findUnique({
        where: { id: body.stationId },
        select: { id: true, type: true, isActive: true },
      })
    : null;
  if (body.stationId && (!station?.isActive || station.type === 'DISPLAY')) {
    throw new AppError(400, 'STATION_INVALID');
  }

  const invalid = new AppError(401, 'AUTH_INVALID_CREDENTIALS');
  const secret = body.password;
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
  const failureContext = { origin, stationId: station?.id ?? null };
  const fail = async (reason: string): Promise<never> => {
    await recordLoginFailure(db, user.id, slot, { ...failureContext, reason });
    throw invalid;
  };

  if (!(await verifySecret(user.passwordHash, secret))) return fail('invalid_secret');
  if (!user.isActive) return fail('inactive');
  const role = openingRole(user.roles, origin, station?.type ?? null);
  if (role === null) {
    // Outside, the account stays indistinguishable from a wrong password; in the shop the
    // password was right and the station is the problem.
    if (origin === 'REMOTE') return fail('role_remote_forbidden');
    await clearLoginFailures(db, user.id);
    throw new AppError(400, 'STATION_INVALID');
  }

  let authMethod: AuthMethod = 'PASSWORD';
  let totpStep: number | undefined;
  if (body.totp !== undefined) {
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

  // A password the admin set opens nothing by itself: the user chooses theirs at this login (H20).
  // Identity is proven by now, so the answer helps and the attempt does not count as a failure.
  let newPasswordHash: string | undefined;
  if (user.passwordChangeRequired) {
    if (body.newPassword === undefined || body.newPassword === body.password) {
      await clearLoginFailures(db, user.id);
      if (body.newPassword === undefined) throw new AppError(403, 'AUTH_PASSWORD_CHANGE_REQUIRED');
      throw new AppError(400, 'AUTH_PASSWORD_UNCHANGED');
    }
    newPasswordHash = await hashSecret(body.newPassword);
  }

  // The step is spent and the counter reset in one statement: a replayed code loses the race.
  const cleared = await clearLoginFailures(db, user.id, {
    ...(totpStep !== undefined && { where: unspentTotpStep(totpStep) }),
    data: {
      ...(totpStep !== undefined && { totpLastStep: totpStep }),
      ...(newPasswordHash !== undefined && {
        passwordHash: newPasswordHash,
        passwordChangeRequired: false,
      }),
    },
  });
  if (!cleared) return fail('totp_replayed');

  const self = { userId: user.id, activeRole: role, stationId: station?.id ?? null, origin };
  const created = await db.$transaction(async (tx) => {
    if (newPasswordHash !== undefined) {
      await recordAudit(tx, {
        ...self,
        action: 'user.password_set',
        entityType: 'user',
        entityId: user.id,
        before: { passwordChangeRequired: true },
        after: { passwordChangeRequired: false },
        reason: 'change_required',
      });
    }
    await purgeExpiredSessions(tx, user.id, now);
    await replaceSessions(tx, user.id, 'new_login');
    const session = await createSession(tx, {
      userId: user.id,
      activeRole: role,
      stationId: station?.id ?? null,
      origin,
      authMethod,
      ttlHours: deps.sessionHours,
      now,
    });
    await recordAudit(tx, {
      ...self,
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
      activeRole: role,
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
