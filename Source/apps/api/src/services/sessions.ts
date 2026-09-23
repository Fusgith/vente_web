import { createHash, randomBytes } from 'node:crypto';

import type { AccessOrigin, AuthMe, AuthMethod, ErrorCode, Role } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { StationType } from '../generated/prisma/enums.js';
import { recordAudit, type AuditTx } from './audit.js';
import { readPositiveIntSetting } from './settings.js';

/** Cookie holding the random session token (T5); `__Host-` binds it to HTTPS, path `/`, no domain. */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-vw_session' : 'vw_session';
}

/** Server-side idle limits by context, in minutes (⚠️ H19). */
const IDLE_MINUTES_REMOTE = 60;
const IDLE_MINUTES_LAN_DEFAULT = 15;
/**
 * `last_seen_at` is written at most this often, to keep reads cheap; the idle limit tolerates
 * one such interval, so a session used right before its touch is not cut short.
 */
export const TOUCH_INTERVAL_MS = 60_000;

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the SHA-256 of the token is stored: a database dump gives no usable cookie. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function idleMinutesFor(
  db: Db,
  origin: AccessOrigin,
  stationType: StationType | null | undefined,
): Promise<number> {
  if (origin === 'REMOTE') return IDLE_MINUTES_REMOTE;
  if (stationType === 'SALES') return readPositiveIntSetting(db, 'session.lock_minutes.tablet', 5);
  if (stationType === 'REGISTER') {
    return readPositiveIntSetting(db, 'session.lock_minutes.register', IDLE_MINUTES_LAN_DEFAULT);
  }
  return IDLE_MINUTES_LAN_DEFAULT;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roles: Role[];
  totpEnabled: boolean;
}

export interface AuthSession {
  id: string;
  activeRole: Role;
  origin: AccessOrigin;
  authMethod: AuthMethod;
  stationId: string | null;
  stationType: StationType | null;
  expiresAt: Date;
}

/** What every authenticated handler sees on `request.auth`. */
export interface AuthContext {
  user: AuthUser;
  session: AuthSession;
  idleMinutes: number;
}

export type SessionResolution =
  { auth: AuthContext; failure: null } | { auth: null; failure: ErrorCode };

const userSelect = {
  id: true,
  username: true,
  fullName: true,
  roles: true,
  isActive: true,
  totpEnabledAt: true,
} as const;

/**
 * Turns a cookie token into an auth context, enforcing every per-request rule of CDC technique
 * §8: lifetime, active account, role still held, origin (a LAN session never works remotely),
 * idle limit. Invalid rows are deleted on the spot; the caller only sees the failure code.
 */
export async function resolveSession(
  db: Db,
  token: string,
  requestOrigin: AccessOrigin,
  now = new Date(),
): Promise<SessionResolution> {
  const row = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: userSelect }, station: { select: { type: true } } },
  });
  if (!row) return { auth: null, failure: 'AUTH_REQUIRED' };

  const drop = (failure: ErrorCode): SessionResolution => ({ auth: null, failure });
  const audit = {
    userId: row.userId,
    activeRole: row.activeRole,
    stationId: row.stationId,
    entityType: 'session',
    entityId: row.id,
  };

  // Every end of session leaves one audit row (RG-AUD-01), whatever ended it: two requests
  // racing on the same dead session audit it once.
  const end = async (action: string, reason: string, failure: ErrorCode, origin = row.origin) => {
    await db.$transaction(async (tx) => {
      const { count } = await tx.session.deleteMany({ where: { id: row.id } });
      if (count === 1) await recordAudit(tx, { ...audit, origin, action, reason });
    });
    return drop(failure);
  };

  if (row.expiresAt <= now) return end('auth.session_expired', 'absolute', 'AUTH_SESSION_EXPIRED');
  if (!row.user.isActive) return end('auth.session_expired', 'inactive_account', 'AUTH_REQUIRED');
  if (!row.user.roles.includes(row.activeRole)) {
    return end('auth.session_expired', 'role_lost', 'AUTH_REQUIRED');
  }
  if (row.origin === 'LAN' && requestOrigin === 'REMOTE') {
    return end('auth.origin_rejected', 'remote_request', 'AUTH_ORIGIN_MISMATCH', requestOrigin);
  }

  const idleMinutes = await idleMinutesFor(db, row.origin, row.station?.type);
  const idleMs = now.getTime() - row.lastSeenAt.getTime();
  if (idleMs > idleMinutes * 60_000 + TOUCH_INTERVAL_MS) {
    return end('auth.session_expired', 'idle', 'AUTH_SESSION_IDLE');
  }
  if (idleMs > TOUCH_INTERVAL_MS) {
    await db.session.updateMany({ where: { id: row.id }, data: { lastSeenAt: now } });
  }

  return {
    auth: {
      user: {
        id: row.user.id,
        username: row.user.username,
        fullName: row.user.fullName,
        roles: row.user.roles,
        totpEnabled: row.user.totpEnabledAt !== null,
      },
      session: {
        id: row.id,
        activeRole: row.activeRole,
        origin: row.origin,
        authMethod: row.authMethod,
        stationId: row.stationId,
        stationType: row.station?.type ?? null,
        expiresAt: row.expiresAt,
      },
      idleMinutes,
    },
    failure: null,
  };
}

export interface CreateSessionInput {
  userId: string;
  activeRole: Role;
  stationId: string | null;
  origin: AccessOrigin;
  authMethod: AuthMethod;
  ttlHours: number;
  now: Date;
}

/** Inserts the session row and returns the token to put in the cookie (never stored). */
export async function createSession(
  tx: AuditTx,
  input: CreateSessionInput,
): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(input.now.getTime() + input.ttlHours * 3_600_000);
  const row = await tx.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: input.userId,
      activeRole: input.activeRole,
      stationId: input.stationId,
      origin: input.origin,
      authMethod: input.authMethod,
      expiresAt,
      lastSeenAt: input.now,
    },
    select: { id: true },
  });
  return { token, id: row.id, expiresAt };
}

export interface RevokeSessionsFilter {
  userId: string;
  /** Keep this session (the caller's own). */
  exceptId?: string;
  /** Only sessions opened from this origin. */
  origin?: AccessOrigin;
}

/** Revocation is a plain DELETE (T5); returns how many sessions were dropped. */
export async function revokeSessions(tx: AuditTx, filter: RevokeSessionsFilter): Promise<number> {
  const result = await tx.session.deleteMany({
    where: {
      userId: filter.userId,
      ...(filter.exceptId ? { id: { not: filter.exceptId } } : {}),
      ...(filter.origin ? { origin: filter.origin } : {}),
    },
  });
  return result.count;
}

/** Sweeps the user's sessions past their lifetime, each end audited like any other (RG-AUD-01). */
export async function purgeExpiredSessions(tx: AuditTx, userId: string, now: Date): Promise<void> {
  const expired = await tx.session.findMany({
    where: { userId, expiresAt: { lte: now } },
    select: { id: true, activeRole: true, stationId: true, origin: true },
  });
  for (const session of expired) {
    const { count } = await tx.session.deleteMany({ where: { id: session.id } });
    if (count !== 1) continue;
    await recordAudit(tx, {
      userId,
      activeRole: session.activeRole,
      stationId: session.stationId,
      origin: session.origin,
      action: 'auth.session_expired',
      entityType: 'session',
      entityId: session.id,
      reason: 'absolute',
    });
  }
}

export function toAuthMe(auth: AuthContext): AuthMe {
  return {
    user: auth.user,
    session: {
      activeRole: auth.session.activeRole,
      origin: auth.session.origin,
      authMethod: auth.session.authMethod,
      stationId: auth.session.stationId,
      expiresAt: auth.session.expiresAt.toISOString(),
      idleMinutes: auth.idleMinutes,
    },
  };
}

/**
 * Logout of the current session (audit `auth.logout`), audited only by the request that deleted
 * it: a double tap, or a revocation that got there first, already accounts for its end.
 */
export async function endSession(db: Db, auth: AuthContext): Promise<void> {
  await db.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({ where: { id: auth.session.id } });
    if (count !== 1) return;
    await recordAudit(tx, {
      userId: auth.user.id,
      activeRole: auth.session.activeRole,
      stationId: auth.session.stationId,
      origin: auth.session.origin,
      action: 'auth.logout',
      entityType: 'session',
      entityId: auth.session.id,
    });
  });
}

/** Logout everywhere: every session of the user, including the current one (none left: no audit). */
export async function endAllSessions(db: Db, auth: AuthContext): Promise<number> {
  return db.$transaction(async (tx) => {
    const count = await revokeSessions(tx, { userId: auth.user.id });
    if (count === 0) return 0;
    await recordAudit(tx, {
      userId: auth.user.id,
      activeRole: auth.session.activeRole,
      stationId: auth.session.stationId,
      origin: auth.session.origin,
      action: 'auth.logout_all',
      entityType: 'user',
      entityId: auth.user.id,
      after: { count },
    });
    return count;
  });
}
