import type { AccessOrigin } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { User } from '../generated/prisma/client.js';
import { by, failureContext, loadUser, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { clearLoginFailures, recordLoginFailure, reserveAttemptOrThrow } from './lockout.js';
import { hashSecret, verifySecret } from './password-hash.js';
import { revokeSessions } from './sessions.js';

/** A secret change drops the sessions opened with the old secret (whoever held it). */
export async function revokeAndAudit(
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

/**
 * `changeRequired`: a password the admin set is only a way in, replaced by the user's own at the
 * next login (H20); one the user chose is theirs.
 */
async function storePassword(
  db: Db,
  actor: Actor,
  target: User,
  password: string,
  changeRequired: boolean,
): Promise<void> {
  const passwordHash = await hashSecret(password);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { passwordHash, passwordChangeRequired: changeRequired },
    });
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

// ---- Admin operations (annexe B: comptes — admin only; H20) ----

/**
 * Sets or resets the password of any account — the way back from a forgotten one, and the
 * temporary password of a new account (H57). The admin never sees the old one; the audit row
 * records whether one existed. Never the owner's: only the owner chooses it, with a one-time
 * activation code (RG-USR-10, H20).
 */
export async function adminSetPassword(
  db: Db,
  actor: Actor,
  targetId: string,
  password: string,
): Promise<void> {
  const target = await loadUser(db, targetId);
  if (target.roles.includes('owner')) throw new AppError(403, 'OWNER_PASSWORD_SELF_ONLY');
  await storePassword(db, actor, target, password, true);
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

// ---- Self-service (H20) ----

/**
 * A wrong current secret is a guess like any other: same slot, same counter, same lock
 * (RG-USR-05). A right one restarts the window, as a login would.
 */
async function verifyCurrentOrFail(
  db: Db,
  actor: Actor,
  user: User,
  current: string,
  reason: string,
): Promise<void> {
  const slot = await reserveAttemptOrThrow(db, user.id);
  if (await verifySecret(user.passwordHash, current)) {
    await clearLoginFailures(db, user.id);
    return;
  }
  await recordLoginFailure(db, user.id, slot, failureContext(actor, reason));
  throw new AppError(401, 'AUTH_INVALID_CREDENTIALS');
}

export async function changeOwnPassword(
  db: Db,
  actor: Actor,
  current: string,
  password: string,
): Promise<void> {
  const user = await loadUser(db, actor.userId);
  await verifyCurrentOrFail(db, actor, user, current, 'password_change');
  await storePassword(db, actor, user, password, false);
}
