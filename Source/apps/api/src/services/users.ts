import type { CreateUserBody, UpdateUserBody, UserAccount } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { by, loadUser, type Actor } from './actor.js';
import { recordAudit, type AuditSnapshot, type AuditTx } from './audit.js';
import { revokeAndAudit } from './credentials.js';

/** What the audit row and the change compare: never a secret (RG-AUD-01). */
const TRACKED = ['username', 'fullName', 'roles', 'ticketLetter', 'isActive'] as const;
type Tracked = Pick<User, (typeof TRACKED)[number]>;

export function toUserAccount(user: User): UserAccount {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roles: user.roles,
    ticketLetter: user.ticketLetter,
    isActive: user.isActive,
    hasPassword: user.passwordHash !== null,
    passwordChangeRequired: user.passwordChangeRequired,
    totpEnabled: user.totpEnabledAt !== null,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
  };
}

/** Every account, deactivated ones included: they stay readable in the history (RG-USR-06). */
export async function listUsers(db: Db): Promise<UserAccount[]> {
  const users = await db.user.findMany({ orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }] });
  return users.map(toUserAccount);
}

/** Each sales user carries a ticket letter (RG-USR-07). */
function assertTicketLetter(account: Tracked): void {
  if (account.roles.includes('sales') && account.ticketLetter === null) {
    throw new AppError(400, 'TICKET_LETTER_REQUIRED');
  }
}

/** Which unique index refused the row: the username (any case) or an active sales letter. */
async function conflictOf(db: Db, account: Tracked, exceptId?: string): Promise<AppError> {
  const twin = await db.user.findFirst({
    where: {
      username: { equals: account.username, mode: 'insensitive' },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  return new AppError(409, twin ? 'USERNAME_TAKEN' : 'TICKET_LETTER_TAKEN');
}

async function uniqueOrConflict<T>(
  db: Db,
  account: Tracked,
  exceptId: string | undefined,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw await conflictOf(db, account, exceptId);
    }
    throw error;
  }
}

function snapshot(account: Tracked, keys: readonly (keyof Tracked)[]): AuditSnapshot {
  return Object.fromEntries(keys.map((key) => [key, account[key]]));
}

/** The admin creates the account; a temporary password or the owner's activation code comes next (annexe B, H57). */
export async function createUser(db: Db, actor: Actor, body: CreateUserBody): Promise<UserAccount> {
  const account: Tracked = {
    username: body.username,
    fullName: body.fullName,
    roles: body.roles,
    ticketLetter: body.ticketLetter ?? null,
    isActive: true,
  };
  assertTicketLetter(account);
  const user = await uniqueOrConflict(db, account, undefined, () =>
    db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: account });
      await recordAudit(tx, {
        ...by(actor),
        action: 'user.created',
        entityType: 'user',
        entityId: created.id,
        after: snapshot(account, TRACKED),
      });
      return created;
    }),
  );
  return toUserAccount(user);
}

/** The shop keeps an admin able to manage the accounts. */
async function assertAnotherAdmin(tx: AuditTx, targetId: string): Promise<void> {
  const others = await tx.user.count({
    where: { isActive: true, roles: { has: 'admin' }, NOT: { id: targetId } },
  });
  if (others === 0) throw new AppError(409, 'LAST_ADMIN');
}

/**
 * Changes an account, never deletes it (RG-USR-06). A change of roles or a deactivation closes
 * every session of the account, the admin's own included: the next login reads the new rights.
 */
export async function updateUser(
  db: Db,
  actor: Actor,
  targetId: string,
  body: UpdateUserBody,
): Promise<UserAccount> {
  const target = await loadUser(db, targetId);
  const next: Tracked = {
    username: body.username ?? target.username,
    fullName: body.fullName ?? target.fullName,
    roles: body.roles ?? target.roles,
    ticketLetter: body.ticketLetter === undefined ? target.ticketLetter : body.ticketLetter,
    isActive: body.isActive ?? target.isActive,
  };
  const changed = TRACKED.filter(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(target[key]),
  );
  if (changed.length === 0) return toUserAccount(target);
  if (next.isActive) assertTicketLetter(next);

  const rolesChanged = changed.includes('roles');
  const deactivated = target.isActive && !next.isActive;
  const losesAdmin =
    target.isActive &&
    target.roles.includes('admin') &&
    !(next.isActive && next.roles.includes('admin'));

  const user = await uniqueOrConflict(db, next, targetId, () =>
    db.$transaction(async (tx) => {
      if (losesAdmin) await assertAnotherAdmin(tx, targetId);
      const updated = await tx.user.update({ where: { id: targetId }, data: next });
      await recordAudit(tx, {
        ...by(actor),
        action: deactivated ? 'user.deactivated' : 'user.updated',
        entityType: 'user',
        entityId: targetId,
        before: snapshot(target, changed),
        after: snapshot(next, changed),
      });
      if (rolesChanged || deactivated) await revokeAndAudit(tx, actor, target, {});
      return updated;
    }),
  );
  return toUserAccount(user);
}
