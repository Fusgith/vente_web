import {
  isOperationalRole,
  type AccessOrigin,
  type AuthMethod,
  type Role,
  type TotpEnrolment,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { User } from '../generated/prisma/client.js';
import { recordAudit, type AuditEntry, type AuditTx } from './audit.js';
import {
  clearLoginFailures,
  recordLoginFailure,
  reserveAttemptOrThrow,
  unspentTotpStep,
  type AttemptSlot,
  type ClearLoginFailuresOptions,
  type FailureContext,
} from './lockout.js';
import { hashSecret, verifySecret } from './password-hash.js';
import { revokeSessions } from './sessions.js';
import { generateTotpSecret, totpUri, verifyTotp } from './totp.js';

/** The authenticated caller, as the audit log records it (RG-AUD-01). */
export interface Actor {
  userId: string;
  sessionId: string;
  activeRole: Role;
  stationId: string | null;
  origin: AccessOrigin;
  authMethod: AuthMethod;
}

type ActorFields = Pick<AuditEntry, 'userId' | 'activeRole' | 'stationId' | 'origin'>;

function by(actor: Actor): ActorFields {
  return {
    userId: actor.userId,
    activeRole: actor.activeRole,
    stationId: actor.stationId,
    origin: actor.origin,
  };
}

function failureContext(actor: Actor, reason: string): FailureContext {
  return { origin: actor.origin, role: actor.activeRole, stationId: actor.stationId, reason };
}

async function loadUser(db: Db, id: string): Promise<User> {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, 'NOT_FOUND');
  return user;
}

function assertCanHoldPin(user: User): void {
  if (!user.roles.some(isOperationalRole)) throw new AppError(400, 'PIN_REQUIRES_OPERATIONAL_ROLE');
}

/** Any secret change drops the account's other sessions (whoever held the old secret). */
async function revokeAndAudit(
  tx: AuditTx,
  actor: Actor,
  target: User,
  filter: { exceptId?: string; origin?: AccessOrigin },
): Promise<void> {
  const count = await revokeSessions(tx, { userId: target.id, ...filter });
  if (count === 0) return;
  await recordAudit(tx, {
    ...by(actor),
    action: 'user.sessions_revoked',
    entityType: 'user',
    entityId: target.id,
    after: { count },
  });
}

async function storePin(db: Db, actor: Actor, target: User, pin: string): Promise<void> {
  const pinHash = await hashSecret(pin);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { pinHash } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'user.pin_set',
      entityType: 'user',
      entityId: target.id,
      before: { hasPin: target.pinHash !== null },
      after: { hasPin: true },
    });
    await revokeAndAudit(tx, actor, target, { exceptId: actor.sessionId });
  });
}

async function storePassword(db: Db, actor: Actor, target: User, password: string): Promise<void> {
  const passwordHash = await hashSecret(password);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { passwordHash } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'user.password_set',
      entityType: 'user',
      entityId: target.id,
      before: { hasPassword: target.passwordHash !== null },
      after: { hasPassword: true },
    });
    await revokeAndAudit(tx, actor, target, { exceptId: actor.sessionId });
  });
}

// ---- Admin operations (annexe B: comptes, PIN — admin only; ⚠️ H20) ----

export async function adminSetPin(
  db: Db,
  actor: Actor,
  targetId: string,
  pin: string,
): Promise<void> {
  const target = await loadUser(db, targetId);
  assertCanHoldPin(target);
  await storePin(db, actor, target, pin);
}

export async function adminSetPassword(
  db: Db,
  actor: Actor,
  targetId: string,
  password: string,
): Promise<void> {
  const target = await loadUser(db, targetId);
  await storePassword(db, actor, target, password);
}

/** Lifts a lock before its 15 minutes elapse (RG-USR-05). */
export async function adminUnlock(db: Db, actor: Actor, targetId: string): Promise<void> {
  const target = await loadUser(db, targetId);
  await db.$transaction(async (tx) => {
    await clearLoginFailures(tx, target.id);
    await recordAudit(tx, {
      ...by(actor),
      action: 'user.unlocked',
      entityType: 'user',
      entityId: target.id,
      before: { lockedUntil: target.lockedUntil?.toISOString() ?? null },
      after: { lockedUntil: null },
    });
  });
}

/** Forgets the TOTP secret; the user enrols again from the shop. Remote sessions die with it. */
export async function adminResetTotp(db: Db, actor: Actor, targetId: string): Promise<void> {
  const target = await loadUser(db, targetId);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'user.totp_reset',
      entityType: 'user',
      entityId: target.id,
      before: { totpEnabled: target.totpEnabledAt !== null },
      after: { totpEnabled: false },
    });
    await revokeAndAudit(tx, actor, target, { origin: 'REMOTE' });
  });
}

export async function adminRevokeSessions(db: Db, actor: Actor, targetId: string): Promise<void> {
  const target = await loadUser(db, targetId);
  await db.$transaction((tx) => revokeAndAudit(tx, actor, target, {}));
}

// ---- Self-service (⚠️ H20) ----

/**
 * A wrong current secret is a guess like any other: same slot, same counter, same lock
 * (RG-USR-05). A right one restarts the window, as a login would.
 */
async function verifyCurrentOrFail(
  db: Db,
  actor: Actor,
  user: User,
  hashes: (string | null)[],
  current: string,
  reason: string,
): Promise<void> {
  const slot = await reserveAttemptOrThrow(db, user.id);
  for (const storedHash of hashes) {
    if (await verifySecret(storedHash, current)) {
      await clearLoginFailures(db, user.id);
      return;
    }
  }
  await recordLoginFailure(db, user.id, slot, failureContext(actor, reason));
  throw new AppError(401, 'AUTH_INVALID_CREDENTIALS');
}

/** The current PIN or the current password unlocks a PIN change. */
export async function changeOwnPin(
  db: Db,
  actor: Actor,
  current: string,
  pin: string,
): Promise<void> {
  const user = await loadUser(db, actor.userId);
  assertCanHoldPin(user);
  await verifyCurrentOrFail(
    db,
    actor,
    user,
    [user.pinHash, user.passwordHash],
    current,
    'pin_change',
  );
  await storePin(db, actor, user, pin);
}

export async function changeOwnPassword(
  db: Db,
  actor: Actor,
  current: string,
  password: string,
): Promise<void> {
  const user = await loadUser(db, actor.userId);
  await verifyCurrentOrFail(db, actor, user, [user.passwordHash], current, 'password_change');
  await storePassword(db, actor, user, password);
}

/** A verified code, still to be spent: the slot ends once the step is claimed or refused. */
interface VerifiedTotp {
  step: number;
  slot: AttemptSlot;
}

async function verifyTotpAttempt(
  db: Db,
  actor: Actor,
  user: User,
  secret: string,
  lastStep: number | null,
  code: string,
  reason: string,
  now: Date,
): Promise<VerifiedTotp> {
  const slot = await reserveAttemptOrThrow(db, user.id);
  const step = verifyTotp(secret, code, { lastStep, now: now.getTime() });
  if (step !== null) return { step, slot };
  await recordLoginFailure(db, user.id, slot, failureContext(actor, reason));
  throw new AppError(401, 'AUTH_TOTP_INVALID');
}

/** The code was right but another request spent it first: a replay, counted as such. */
async function refuseReplay(db: Db, actor: Actor, user: User, slot: AttemptSlot): Promise<never> {
  await recordLoginFailure(db, user.id, slot, failureContext(actor, 'totp_replayed'));
  throw new AppError(401, 'AUTH_TOTP_INVALID');
}

/** Writes the user columns and the audit row together; false when `options.where` failed. */
async function writeAndAudit(
  db: Db,
  userId: string,
  options: ClearLoginFailuresOptions,
  entry: AuditEntry,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    if (!(await clearLoginFailures(tx, userId, options))) return false;
    await recordAudit(tx, entry);
    return true;
  });
}

/**
 * Starts (or restarts) TOTP enrolment: a fresh secret is stored as pending and becomes active
 * only once `confirmTotpEnrolment` proves the authenticator app has it. From the shop, with a
 * password session; a current code is required when TOTP is already active.
 */
export async function startTotpEnrolment(
  db: Db,
  actor: Actor,
  requestOrigin: AccessOrigin,
  code: string | undefined,
  now = new Date(),
): Promise<TotpEnrolment> {
  if (actor.authMethod === 'PIN') throw new AppError(403, 'AUTH_REAUTH_REQUIRED');
  if (requestOrigin !== 'LAN') throw new AppError(403, 'AUTH_LAN_ONLY');
  const user = await loadUser(db, actor.userId);

  let current: VerifiedTotp | null = null;
  if (user.totpSecret && user.totpEnabledAt) {
    if (code === undefined) throw new AppError(401, 'AUTH_TOTP_REQUIRED');
    current = await verifyTotpAttempt(
      db,
      actor,
      user,
      user.totpSecret,
      user.totpLastStep,
      code,
      'totp_reenrol',
      now,
    );
  }

  const secret = generateTotpSecret();
  const options: ClearLoginFailuresOptions = current
    ? {
        where: unspentTotpStep(current.step),
        data: { totpPendingSecret: secret, totpLastStep: current.step },
      }
    : { data: { totpPendingSecret: secret } };
  const stored = await writeAndAudit(db, user.id, options, {
    ...by(actor),
    action: 'user.totp_enrolled',
    entityType: 'user',
    entityId: user.id,
    after: { totpPending: true },
  });
  if (!stored && current) return refuseReplay(db, actor, user, current.slot);
  if (!stored) throw new AppError(404, 'NOT_FOUND');
  return { uri: totpUri(secret, user.username), secret };
}

export async function confirmTotpEnrolment(
  db: Db,
  actor: Actor,
  code: string,
  now = new Date(),
): Promise<void> {
  if (actor.authMethod === 'PIN') throw new AppError(403, 'AUTH_REAUTH_REQUIRED');
  const user = await loadUser(db, actor.userId);
  const pending = user.totpPendingSecret;
  if (!pending) throw new AppError(400, 'AUTH_TOTP_NOT_PENDING');

  // The pending secret has never been used: no step of it is spent yet.
  const { step, slot } = await verifyTotpAttempt(
    db,
    actor,
    user,
    pending,
    null,
    code,
    'totp_confirm',
    now,
  );
  const activated = await writeAndAudit(
    db,
    user.id,
    {
      // Still the secret we verified: a concurrent confirmation or restart loses nothing.
      where: { totpPendingSecret: pending },
      data: {
        totpSecret: pending,
        totpPendingSecret: null,
        totpEnabledAt: now,
        totpLastStep: step,
      },
    },
    {
      ...by(actor),
      action: 'user.totp_enabled',
      entityType: 'user',
      entityId: user.id,
      before: { totpEnabled: user.totpEnabledAt !== null },
      after: { totpEnabled: true },
    },
  );
  if (!activated) return refuseReplay(db, actor, user, slot);
}
