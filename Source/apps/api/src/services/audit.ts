import type { AccessOrigin, Role } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';

/** A client or the transaction it runs in: the audit row commits with the change it traces. */
export type AuditTx = Db | Prisma.TransactionClient;

/** JSON snapshot of an entity before/after a change; secrets are never allowed in it. */
export type AuditSnapshot = Record<string, Prisma.InputJsonValue | null>;

export interface AuditEntry {
  /** Actor; absent for system events (nobody logged in yet). */
  userId?: string | null;
  activeRole?: Role | null;
  stationId?: string | null;
  origin?: AccessOrigin | null;
  /** Dotted verb, e.g. `auth.login`, `user.pin_set`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: AuditSnapshot;
  after?: AuditSnapshot;
  reason?: string | null;
}

const SENSITIVE_KEY = /pin|password|secret|hash|token|totp|code/i;

/**
 * Guards RG-AUD-01 against leaking credentials: a key that smells like a secret may only carry
 * a flag (`{ hasPin: true }`, `{ totpEnabled: false }`), never a value.
 */
function assertNoSecret(snapshot: AuditSnapshot | undefined, path: string): void {
  if (!snapshot) return;
  for (const [key, value] of Object.entries(snapshot)) {
    if (SENSITIVE_KEY.test(key) && typeof value !== 'boolean' && value !== null) {
      throw new TypeError(`Audit snapshot ${path}.${key} would store a secret`);
    }
  }
}

/** Appends one immutable row to `audit_log` (RG-AUD-01); the trigger forbids later edits. */
export async function recordAudit(tx: AuditTx, entry: AuditEntry): Promise<void> {
  assertNoSecret(entry.before, 'before');
  assertNoSecret(entry.after, 'after');
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      activeRole: entry.activeRole ?? null,
      stationId: entry.stationId ?? null,
      origin: entry.origin ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      // Prisma's JSON input has no `undefined` member: spread the snapshots only when present.
      ...(entry.before ? { before: entry.before } : {}),
      ...(entry.after ? { after: entry.after } : {}),
      reason: entry.reason ?? null,
    },
  });
}
