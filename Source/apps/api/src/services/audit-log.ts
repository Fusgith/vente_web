import type { AuditPage, AuditQuery, AuditSubject } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { shopDayStart } from './shop-time.js';

/** A page of the log; « Plus anciennes » brings the next one. */
const PAGE_SIZE = 100;

/** The records each subject of the reader's filter covers. */
const SUBJECT_ENTITIES: Record<AuditSubject, string[]> = {
  orders: ['order'],
  customers: ['customer'],
  discounts: ['discount_code', 'discount_request', 'setting'],
  stock: ['product', 'product_promotion'],
  registers: ['register_session'],
  accounts: ['user', 'push_subscription'],
  sessions: ['session'],
};

/**
 * The audit log as the manager, the owner and the admin read it (RG-AUD-01): one shop day, the
 * latest first, narrowed to a subject or to who acted. Read only: the table stays append-only.
 */
export async function readAuditLog(
  db: Db,
  { day, subject, user, before }: AuditQuery,
  now = new Date(),
): Promise<AuditPage> {
  // Noon UTC is 15:00 at the shop: always inside the day asked.
  const reference = day ? new Date(`${day}T12:00:00Z`) : now;
  const where: Prisma.AuditLogWhereInput = {
    at: { gte: shopDayStart(reference), lt: shopDayStart(reference, 1) },
    ...(subject ? { entityType: { in: SUBJECT_ENTITIES[subject] } } : {}),
    ...(user ? { user: { username: { equals: user, mode: 'insensitive' } } } : {}),
  };
  const cursor = before
    ? await db.auditLog.findUnique({ where: { id: before }, select: { id: true, at: true } })
    : null;
  // Strictly older than the last entry shown; entries of one transaction share their instant.
  const older: Prisma.AuditLogWhereInput = cursor
    ? { OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }] }
    : {};
  const rows = await db.auditLog.findMany({
    where: { AND: [where, older] },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    include: { user: { select: { username: true, fullName: true } } },
  });
  return {
    entries: rows.slice(0, PAGE_SIZE).map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      user: row.user,
      activeRole: row.activeRole,
      origin: row.origin,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      before: row.before,
      after: row.after,
      reason: row.reason,
    })),
    more: rows.length > PAGE_SIZE,
  };
}
