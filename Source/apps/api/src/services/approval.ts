import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { failureContext, type Actor } from './actor.js';
import { clearLoginFailures, recordLoginFailure, reserveAttemptOrThrow } from './lockout.js';
import { verifySecret } from './password-hash.js';

/**
 * The manager's validation on the spot (RG-ANN-02, ⚠️ H36): their name and PIN typed on the
 * screen asking for it. The attempt counts like a login (RG-USR-05): a locked account cannot
 * validate, a wrong PIN is a failure towards the lock. A second person: never the one asking
 * (annexe B, the cashier creates, the manager validates). Returns the manager's id.
 */
export async function managerApproval(
  db: Db,
  actor: Actor,
  { username, pin }: { username: string; pin: string },
): Promise<{ id: string; fullName: string }> {
  const manager = await db.user.findUnique({ where: { username } });
  if (!manager) {
    // Same cost as a real check: no timing oracle on account existence.
    await verifySecret(null, pin);
    throw new AppError(401, 'AUTH_INVALID_CREDENTIALS');
  }
  if (manager.id === actor.userId) throw new AppError(403, 'APPROVAL_SELF');
  const slot = await reserveAttemptOrThrow(db, manager.id);
  if (!(await verifySecret(manager.pinHash, pin)) || !manager.isActive) {
    await recordLoginFailure(db, manager.id, slot, failureContext(actor, 'approval_invalid'));
    throw new AppError(401, 'AUTH_INVALID_CREDENTIALS');
  }
  await clearLoginFailures(db, manager.id);
  if (!manager.roles.includes('manager')) throw new AppError(403, 'APPROVAL_NOT_MANAGER');
  return { id: manager.id, fullName: manager.fullName };
}
