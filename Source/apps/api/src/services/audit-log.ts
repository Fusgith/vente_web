import type { AuditPage, AuditQuery, AuditSubject } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { shopDayStart } from './shop-time.js';

/** A page of the log; « Plus anciennes » brings the next one. */
const PAGE_SIZE = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every id a value holds, at any depth. */
function idsIn(value: unknown, into: Set<string>): Set<string> {
  if (typeof value === 'string') {
    if (UUID.test(value)) into.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) idsIn(item, into);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) idsIn(item, into);
  }
  return into;
}

/** What the reader knows each id by (T-097): a number, a name, a label; ids of other records stay. */
async function namesOf(db: Db, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const where = { id: { in: ids } };
  const [orders, invoices, customers, products, units, users, categories, methods, stations] =
    await Promise.all([
      db.order.findMany({ where, select: { id: true, number: true } }),
      db.invoice.findMany({ where, select: { id: true, number: true } }),
      db.customer.findMany({ where, select: { id: true, name: true } }),
      db.product.findMany({ where, select: { id: true, name: true } }),
      db.productUnit.findMany({
        where,
        select: { id: true, label: true, product: { select: { name: true } } },
      }),
      db.user.findMany({ where, select: { id: true, fullName: true } }),
      db.category.findMany({ where, select: { id: true, name: true } }),
      db.paymentMethod.findMany({ where, select: { id: true, label: true } }),
      db.station.findMany({ where, select: { id: true, name: true } }),
    ]);
  return Object.fromEntries([
    ...orders.map((row) => [row.id, row.number]),
    ...invoices.map((row) => [row.id, row.number]),
    ...customers.map((row) => [row.id, row.name]),
    ...products.map((row) => [row.id, row.name]),
    ...units.map((row) => [row.id, `${row.product.name} (${row.label})`]),
    ...users.map((row) => [row.id, row.fullName]),
    ...categories.map((row) => [row.id, row.name]),
    ...methods.map((row) => [row.id, row.label]),
    ...stations.map((row) => [row.id, row.name]),
  ]);
}

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
  const shown = rows.slice(0, PAGE_SIZE);
  const ids = new Set<string>();
  for (const row of shown) idsIn([row.entityId, row.before, row.after], ids);
  return {
    entries: shown.map((row) => ({
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
    refs: await namesOf(db, [...ids]),
  };
}
