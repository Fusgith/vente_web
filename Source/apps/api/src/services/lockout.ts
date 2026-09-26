import type { AccessOrigin, Role } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { recordAudit } from './audit.js';

/** Five failures lock the account for fifteen minutes (RG-USR-05). */
export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
/** The count restarts once this long has passed without any failure (H19). */
export const FAILURE_WINDOW_MINUTES = 15;

export interface FailureContext {
  origin: AccessOrigin;
  role?: Role | null;
  stationId?: string | null;
  /** Machine reason: `invalid_secret`, `inactive`, `role_not_held`, `totp_invalid`… */
  reason: string;
}

/**
 * One attempt, taken before any secret is verified. It must end with `clearLoginFailures`
 * (the PIN or password was right), `releaseLoginAttempt` (a TOTP code alone was right) or
 * `recordLoginFailure` (it was not).
 */
export interface AttemptSlot {
  /** Failures in the window, this attempt included. */
  count: number;
  /** Set when this attempt is the last one allowed: a failure keeps the lock, a success lifts it. */
  lockedUntil: Date | null;
  /** `last_failed_at` before this attempt moved it: what a released attempt puts back. */
  previousFailedAt: Date | null;
}

export type AttemptReservation =
  { allowed: true; slot: AttemptSlot } | { allowed: false; retryAfterSeconds: number };

/**
 * Failures in the window after this one: the count restarts after 15 minutes without a failure
 * (each one extends the window, H19) or when a lock has just expired (the row only reaches
 * this expression once it is unlocked). Evaluated under the row lock: attempts serialise.
 */
const NEXT_COUNT = Prisma.sql`CASE
  WHEN "last_failed_at" IS NULL
    OR "last_failed_at" < now() - make_interval(mins => ${FAILURE_WINDOW_MINUTES})
    OR "locked_until" IS NOT NULL
  THEN 1
  ELSE "failed_login_count" + 1
END`;

/**
 * Takes one attempt slot atomically, *before* the secret is verified, so that concurrent
 * requests can never exceed five verifications per window (RG-USR-05): the fifth slot sets the
 * lock, the sixth caller finds it and is refused without any verification. Every clock is the
 * database's `now()`: window, lock and remaining time never mix with the process clock.
 */
export async function reserveLoginAttempt(db: Db, userId: string): Promise<AttemptReservation> {
  const slot = await db.$transaction(async (tx) => {
    // The row stays locked until commit: the timestamp read here is the one the UPDATE replaces.
    const before = await tx.$queryRaw<{ last_failed_at: Date | null }[]>`
      SELECT "last_failed_at" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    const rows = await tx.$queryRaw<{ failed_login_count: number; locked_until: Date | null }[]>`
      UPDATE "users"
      SET "failed_login_count" = ${NEXT_COUNT},
          "last_failed_at" = now(),
          "locked_until" = CASE
            WHEN ${NEXT_COUNT} >= ${LOCKOUT_MAX_FAILURES}
            THEN now() + make_interval(mins => ${LOCKOUT_MINUTES})
            ELSE NULL
          END
      WHERE "id" = ${userId}::uuid AND ("locked_until" IS NULL OR "locked_until" <= now())
      RETURNING "failed_login_count", "locked_until"`;
    const row = rows[0];
    if (!row) return null;
    return {
      count: row.failed_login_count,
      lockedUntil: row.locked_until,
      previousFailedAt: before[0]?.last_failed_at ?? null,
    };
  });
  if (slot) return { allowed: true, slot };
  return { allowed: false, retryAfterSeconds: await lockSecondsLeft(db, userId) };
}

/** Seconds left on the account's lock, by the database clock; 0 when it is not locked. */
async function lockSecondsLeft(
  db: Pick<Db, '$queryRaw'>,
  userId: string,
  forUpdate = false,
): Promise<number> {
  const rows = await db.$queryRaw<{ retry_after_seconds: number }[]>`
    SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("locked_until" - now()))))::int
      AS retry_after_seconds
    FROM "users"
    WHERE "id" = ${userId}::uuid
    ${forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty}`;
  return rows[0]?.retry_after_seconds ?? 0;
}

/**
 * For a write that verifies no secret: refused (423) while the account is locked, and the lock
 * left as it is — only a right secret or the admin lifts it (RG-USR-05, H20). Inside a
 * transaction the row stays held until commit: no lock lands between this check and the write.
 */
export async function assertNotLocked(tx: Pick<Db, '$queryRaw'>, userId: string): Promise<void> {
  const retryAfterSeconds = await lockSecondsLeft(tx, userId, true);
  if (retryAfterSeconds > 0) throw new AppError(423, 'AUTH_LOCKED', { retryAfterSeconds });
}

/** Same, for a caller who is already authenticated: a lock is simply reported (423). */
export async function reserveAttemptOrThrow(db: Db, userId: string): Promise<AttemptSlot> {
  const reservation = await reserveLoginAttempt(db, userId);
  if (!reservation.allowed) {
    throw new AppError(423, 'AUTH_LOCKED', { retryAfterSeconds: reservation.retryAfterSeconds });
  }
  return reservation.slot;
}

/**
 * The reserved attempt failed: the failure is audited, and so is the lock when this attempt
 * triggered it. Failures on unknown usernames never get here: the audit log traces accounts
 * (RG-AUD-02); they only reach the application log.
 */
export async function recordLoginFailure(
  db: Db,
  userId: string,
  slot: AttemptSlot,
  context: FailureContext,
): Promise<void> {
  const actor = {
    origin: context.origin,
    activeRole: context.role ?? null,
    stationId: context.stationId ?? null,
  };
  await db.$transaction(async (tx) => {
    await recordAudit(tx, {
      ...actor,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: userId,
      after: { failedLoginCount: slot.count },
      reason: context.reason,
    });
    if (!slot.lockedUntil) return;
    // A pending TOTP enrolment dies with the lock: its codes were being guessed too.
    await tx.user.updateMany({ where: { id: userId }, data: { totpPendingSecret: null } });
    await recordAudit(tx, {
      ...actor,
      action: 'auth.locked',
      entityType: 'user',
      entityId: userId,
      after: { lockedUntil: slot.lockedUntil.toISOString() },
      reason: context.reason,
    });
  });
}

export interface ClearLoginFailuresOptions {
  /** Extra condition the row must still satisfy (e.g. `unspentTotpStep`). */
  where?: Prisma.UserWhereInput;
  /** Extra columns written with the reset (e.g. the TOTP step just spent). */
  data?: Prisma.UserUpdateManyMutationInput;
}

/**
 * The reserved attempt succeeded: the window restarts (RG-USR-05). Condition and extra columns
 * go in the same statement, so a TOTP step is spent by exactly one request (RG-USR-04):
 * `false` means the condition no longer held and nothing was written.
 */
export async function clearLoginFailures(
  tx: Pick<Db, 'user'>,
  userId: string,
  options: ClearLoginFailuresOptions = {},
): Promise<boolean> {
  const result = await tx.user.updateMany({
    where: { id: userId, ...options.where },
    data: { failedLoginCount: 0, lastFailedAt: null, lockedUntil: null, ...options.data },
  });
  return result.count === 1;
}

/**
 * The reserved attempt succeeded on a TOTP code alone, which proves neither the PIN nor the
 * password (H19): the attempt is handed back as if it had never been taken. The earlier
 * failures stand with their own window (`last_failed_at` put back, unless a later attempt has
 * moved it since), and the lock this attempt set as the fifth slot is lifted; a lock set by
 * another attempt stays.
 */
export async function releaseLoginAttempt(
  tx: Pick<Db, '$executeRaw'>,
  userId: string,
  slot: AttemptSlot,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "users"
    SET "failed_login_count" = GREATEST("failed_login_count" - 1, 0),
        "last_failed_at" = CASE
          WHEN "failed_login_count" <= 1 THEN NULL
          WHEN "failed_login_count" = ${slot.count} THEN ${slot.previousFailedAt}::timestamptz
          ELSE "last_failed_at"
        END,
        "locked_until" = CASE WHEN ${slot.lockedUntil !== null}::boolean
          THEN NULL ELSE "locked_until" END
    WHERE "id" = ${userId}::uuid`;
}

/** Matches the account only while `step` has not been spent yet (RFC 6238 §5.2, single use). */
export function unspentTotpStep(step: number): Prisma.UserWhereInput {
  return { OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] };
}
