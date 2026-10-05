import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { recordAudit } from './audit.js';
import { drawCode } from './discount-codes.js';
import { hashSecret } from './password-hash.js';

/** 16 characters from the unambiguous alphabet, grouped by 4: read off a screen, typed once. */
const BOOTSTRAP_PASSWORD_LENGTH = 16;

export interface BootstrapAdminInput {
  username: string;
  fullName: string;
}

export type BootstrapAdminResult =
  { created: true; userId: string; password: string } | { created: false };

/**
 * The shop's first admin (T-016c): created once, while no active admin exists, with a provisional
 * password shown once and replaced at the first login (H20). Afterwards accounts are the admin's
 * work; this command does nothing. A system event: nobody is logged in to author it (RG-AUD-01).
 */
export async function bootstrapAdmin(
  db: Db,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const password = drawCode(BOOTSTRAP_PASSWORD_LENGTH);
  const passwordHash = await hashSecret(password);
  return db.$transaction(async (tx) => {
    const admins = await tx.user.count({ where: { isActive: true, roles: { has: 'admin' } } });
    if (admins > 0) return { created: false };
    const taken = await tx.user.findUnique({ where: { username: input.username } });
    if (taken) throw new AppError(409, 'USERNAME_TAKEN');
    const account = {
      username: input.username,
      fullName: input.fullName,
      roles: ['admin' as const],
      ticketLetter: null,
      isActive: true,
    };
    const user = await tx.user.create({
      data: { ...account, passwordHash, passwordChangeRequired: true },
    });
    await recordAudit(tx, {
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      after: { ...account, hasPassword: true },
      reason: 'bootstrap',
    });
    return { created: true, userId: user.id, password };
  });
}
