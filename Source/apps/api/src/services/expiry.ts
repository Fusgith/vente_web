import type { Db } from '../db.js';
import { recordAudit } from './audit.js';
import { releaseReservations } from './stock-reservation.js';

/** How often the API looks for orders past their day end (CDC technique §5). */
export const SWEEP_MS = 30_000;

/** An order expired by a sweep, for those told of it. */
export interface ExpiredOrder {
  id: string;
  salesUserId: string;
  /** Its request still awaiting the owner, closed with it (⚠️ H54). */
  requestId?: string;
}

/** At most this many orders per sweep: the next one, 30 s later, takes the rest. */
const BATCH = 100;

/**
 * Expires the orders validated and still not called at their day end (RG-CMD-08, RG-STK-02):
 * `SUBMITTED` → `EXPIRED`, their reservations given back to the available stock, audited as the
 * system's doing. One transaction per order: one that fails is handed to `onError` and tried
 * again at the next sweep, the others expired all the same and returned, so that their followers
 * are told. An order
 * called to a register meanwhile is left to the cashier; once back in the queue after an
 * absence, the next sweep expires it.
 */
export async function expireOrders(
  db: Db,
  onError: (orderId: string, error: unknown) => void,
  now = new Date(),
): Promise<ExpiredOrder[]> {
  const due = await db.order.findMany({
    where: { status: 'SUBMITTED', expiresAt: { lte: now } },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: BATCH,
  });
  const expired: ExpiredOrder[] = [];
  for (const { id } of due) {
    const order = await expireOne(db, id, now).catch((error: unknown) => {
      onError(id, error);
      return null;
    });
    if (order) expired.push(order);
  }
  return expired;
}

async function expireOne(db: Db, id: string, now: Date): Promise<ExpiredOrder | null> {
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ sales_user_id: string; expires_at: Date }[]>`
        UPDATE "orders" SET "status" = 'EXPIRED', "version" = "version" + 1, "updated_at" = now()
         WHERE "id" = ${id}::uuid AND "status" = 'SUBMITTED' AND "expires_at" <= ${now}
        RETURNING "sales_user_id", "expires_at"`;
    if (!row) return null;
    await releaseReservations(tx, id);
    await recordAudit(tx, {
      action: 'order.expired',
      entityType: 'order',
      entityId: id,
      before: { status: 'SUBMITTED', expiresAt: row.expires_at.toISOString() },
      after: { status: 'EXPIRED' },
    });
    // Its request goes with it, though made for a later day end (set aside after this one, ⚠️
    // H54): closed now — never before it was made, the check of the table holds.
    const [request] = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "discount_requests"
           SET "status" = 'EXPIRED',
               "expires_at" = LEAST("expires_at",
                 GREATEST(${now}::timestamptz, "created_at" + INTERVAL '1 millisecond'))
         WHERE "order_id" = ${id}::uuid AND "status" = 'PENDING'
        RETURNING "id"`;
    if (!request) return { id, salesUserId: row.sales_user_id };
    await recordAudit(tx, {
      action: 'discount_request.expired',
      entityType: 'discount_request',
      entityId: request.id,
      before: { status: 'PENDING' },
      after: { status: 'EXPIRED', orderId: id },
      reason: 'order_expired',
    });
    return { id, salesUserId: row.sales_user_id, requestId: request.id };
  });
}
