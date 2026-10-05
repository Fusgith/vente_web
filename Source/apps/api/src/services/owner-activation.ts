import {
  ACTIVATION_CODE_LENGTH,
  ACTIVATION_HOURS,
  groupDiscountCode,
  normalizeDiscountCode,
  type AccessOrigin,
  type ActivateBody,
  type ActivationCode,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, loadUser, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { drawCode } from './discount-codes.js';
import { clearLoginFailures, recordLoginFailure, reserveLoginAttempt } from './lockout.js';
import { hashSecret, verifySecret } from './password-hash.js';
import { revokeSessions } from './sessions.js';

const HOUR_MS = 3_600_000;

/**
 * The admin never sets the owner's password: they hand over a one-time code, valid 24 h, which
 * replaces any previous one (RG-USR-10, H20). Shown once; only its hash is kept.
 */
export async function issueActivationCode(
  db: Db,
  actor: Actor,
  targetId: string,
  now = new Date(),
): Promise<ActivationCode> {
  const target = await loadUser(db, targetId);
  if (!target.roles.includes('owner')) throw new AppError(400, 'ACTIVATION_OWNER_ONLY');
  const code = drawCode(ACTIVATION_CODE_LENGTH);
  const expiresAt = new Date(now.getTime() + ACTIVATION_HOURS * HOUR_MS);
  const activationCodeHash = await hashSecret(code);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { activationCodeHash, activationExpiresAt: expiresAt },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'user.activation_issued',
      entityType: 'user',
      entityId: targetId,
      after: { expiresAt: expiresAt.toISOString() },
    });
  });
  return { code, expiresAt: expiresAt.toISOString() };
}

/**
 * The owner chooses their password with the code (RG-USR-10). A wrong or expired code counts as a
 * failed login (RG-USR-05), with one generic answer; a right one is spent, ends every session
 * opened with the old password and lifts the lock. The owner then logs in as usual.
 */
export async function activateOwner(
  db: Db,
  body: ActivateBody,
  origin: AccessOrigin,
  now = new Date(),
): Promise<void> {
  const invalid = new AppError(401, 'ACTIVATION_INVALID');
  const code = groupDiscountCode(normalizeDiscountCode(body.code));
  const user = await db.user.findUnique({ where: { username: body.username } });
  if (!user) {
    // Same cost as a real verification: no timing oracle on account existence.
    await verifySecret(null, code);
    throw invalid;
  }

  const reservation = await reserveLoginAttempt(db, user.id);
  if (!reservation.allowed) {
    await verifySecret(null, code);
    const { retryAfterSeconds } = reservation;
    if (origin === 'LAN') throw new AppError(423, 'AUTH_LOCKED', { retryAfterSeconds });
    throw invalid;
  }
  const fail = async (reason: string): Promise<never> => {
    await recordLoginFailure(db, user.id, reservation.slot, {
      origin,
      role: 'owner',
      stationId: null,
      reason,
    });
    throw invalid;
  };

  if (!(await verifySecret(user.activationCodeHash, code))) return fail('activation_invalid');
  if (!user.activationExpiresAt || user.activationExpiresAt <= now) {
    return fail('activation_expired');
  }
  if (!user.isActive || !user.roles.includes('owner')) return fail('inactive');

  const passwordHash = await hashSecret(body.password);
  const self = { userId: user.id, activeRole: 'owner' as const, stationId: null, origin };
  const spent = await db.$transaction(async (tx) => {
    // Spent in the same statement that checks it: the same code wins exactly once.
    const cleared = await clearLoginFailures(tx, user.id, {
      where: { activationCodeHash: user.activationCodeHash },
      data: { passwordHash, activationCodeHash: null, activationExpiresAt: null },
    });
    if (!cleared) return false;
    await recordAudit(tx, {
      ...self,
      action: 'user.activation_used',
      entityType: 'user',
      entityId: user.id,
      after: { hasPassword: true },
    });
    const count = await revokeSessions(tx, { userId: user.id });
    if (count > 0) {
      await recordAudit(tx, {
        ...self,
        action: 'user.sessions_revoked',
        entityType: 'user',
        entityId: user.id,
        after: { count },
      });
    }
    return true;
  });
  if (!spent) await fail('activation_replayed');
}
