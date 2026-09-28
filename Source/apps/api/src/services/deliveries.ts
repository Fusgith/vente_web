import type { Order, OrderDeliver } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { findOrder } from './order-view.js';
import { loadOrder } from './orders.js';
import { lockQueue } from './queues.js';
import { nextSequenceValue } from './sequences.js';

/** The order at a counter, and who holds it: the latest delivery of an order being served. */
export async function heldBy(tx: Prisma.TransactionClient, id: string) {
  const [order] = await tx.$queryRaw<{ status: string; version: number }[]>`
    SELECT "status"::text AS "status", "version" FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
  if (!order) throw new AppError(404, 'NOT_FOUND');
  const delivery = await tx.delivery.findFirst({
    where: { orderId: id },
    orderBy: { startedAt: 'desc' },
    select: { id: true, warehouseUserId: true, stationId: true },
  });
  return { ...order, delivery };
}

/** The caller's own order at their counter, or the manager's reach (RG-USR-08, H34). */
async function atMyCounter(tx: Prisma.TransactionClient, actor: Actor, id: string, status: string) {
  const held = await heldBy(tx, id);
  const mine = actor.activeRole === 'manager' || held.delivery?.warehouseUserId === actor.userId;
  if (held.status !== status || !held.delivery || !mine) {
    throw new AppError(409, 'ORDER_NOT_AT_COUNTER');
  }
  return { ...held, delivery: held.delivery };
}

/**
 * Takes an order to prepare (RG-LIV-02, RG-USR-08, H34): the first paid one, or `id` when
 * the customer stands at the counter — audited as such. One order at a time per warehouse user,
 * held under their name so that nobody else prepares it; the delivery queue taken one change at
 * a time, as the register's.
 */
export async function takeForDelivery(db: Db, actor: Actor, id: string | null): Promise<Order> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${actor.userId}::uuid FOR UPDATE`;
    // Held: an order being served whose latest delivery is the caller's.
    const [busy] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "o"."id" FROM "orders" "o"
        JOIN LATERAL (SELECT "warehouse_user_id" FROM "deliveries" "d"
                       WHERE "d"."order_id" = "o"."id" ORDER BY "d"."started_at" DESC LIMIT 1) "last"
          ON TRUE
       WHERE "o"."status" IN ('PREPARING', 'READY') AND "last"."warehouse_user_id" = ${actor.userId}::uuid
       LIMIT 1`;
    if (busy) throw new AppError(409, 'COUNTER_BUSY');
    await lockQueue(tx, 'delivery');
    let orderId = id;
    if (orderId === null) {
      const [first] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "orders" WHERE "status" = 'PAID'
         ORDER BY "queue_rank", "id" LIMIT 1 FOR UPDATE`;
      if (!first) throw new AppError(409, 'QUEUE_EMPTY');
      orderId = first.id;
    }
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: 'PAID' },
      data: { status: 'PREPARING', version: { increment: 1 } },
    });
    if (count === 0) throw new AppError(409, 'ORDER_NOT_IN_QUEUE');
    await tx.delivery.create({
      data: { orderId, warehouseUserId: actor.userId, stationId: actor.stationId },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.preparing',
      entityType: 'order',
      entityId: orderId,
      before: { status: 'PAID' },
      after: { status: 'PREPARING' },
      reason: id === null ? null : 'specific_ticket',
    });
    return loadOrder(tx, orderId);
  });
}

/** Prepared: the ticket is called to the counter (RG-LIV-02); the customer comes to take it. */
export async function markReady(db: Db, actor: Actor, id: string): Promise<Order> {
  return db.$transaction(async (tx) => {
    const { delivery } = await atMyCounter(tx, actor, id, 'PREPARING');
    const now = new Date();
    await tx.order.update({
      where: { id },
      data: { status: 'READY', readyAt: now, version: { increment: 1 } },
    });
    await tx.delivery.update({ where: { id: delivery.id }, data: { readyAt: now } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.ready',
      entityType: 'order',
      entityId: id,
      before: { status: 'PREPARING' },
      after: { status: 'READY' },
    });
    return loadOrder(tx, id);
  });
}

/**
 * Back to the delivery queue (H34): the customer absent when called — last, one more absence,
 * the priority lost (RG-FIL-04, RG-FIL-06) — or, by the manager, an order in preparation or
 * ready given to another counter at its place (RG-USR-08). Still paid, its reservation firm.
 */
export async function backToDeliveryQueue(
  db: Db,
  actor: Actor,
  id: string,
  why: 'no_show' | 'released',
): Promise<{ order: Order; noShowCount: number }> {
  return db.$transaction(async (tx) => {
    const held =
      why === 'no_show' ? await atMyCounter(tx, actor, id, 'READY') : await heldBy(tx, id);
    if (why === 'released' && held.status !== 'PREPARING' && held.status !== 'READY') {
      throw new AppError(409, 'ORDER_NOT_AT_COUNTER');
    }
    await lockQueue(tx, 'delivery');
    const before = await tx.order.findUniqueOrThrow({
      where: { id },
      select: { noShowCount: true, priority: true },
    });
    const absent = why === 'no_show';
    await tx.order.update({
      where: { id },
      data: {
        status: 'PAID',
        readyAt: null,
        version: { increment: 1 },
        ...(absent
          ? {
              queueRank: await nextSequenceValue(tx, 'QUEUE-DELIVERY'),
              noShowCount: { increment: 1 },
              priority: 0,
            }
          : {}),
      },
    });
    const noShowCount = before.noShowCount + (absent ? 1 : 0);
    await recordAudit(tx, {
      ...by(actor),
      action: absent ? 'order.no_show' : 'order.released',
      entityType: 'order',
      entityId: id,
      before: {
        status: held.status,
        warehouseUserId: held.delivery?.warehouseUserId ?? null,
        noShowCount: before.noShowCount,
        priority: before.priority > 0,
      },
      after: { status: 'PAID', noShowCount, priority: absent ? false : before.priority > 0 },
    });
    return { order: await loadOrder(tx, id), noShowCount };
  });
}

/**
 * Handed over (RG-LIV-03, RG-STK-04): every line ticked, the stock goes out — one movement per
 * line, in base unit — the reservation consumed, the order delivered. The stock rows are locked
 * in product order, as a validation locks them (RG-STK-01). A line not handed over is an issue
 * (T-061), never a delivery.
 */
export async function deliverOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version, delivered }: OrderDeliver,
): Promise<Order> {
  return db.$transaction(async (tx) => {
    const held = await atMyCounter(tx, actor, id, 'READY');
    if (held.version !== version) throw new AppError(409, 'ORDER_CHANGED');
    const order = await findOrder(tx, id);
    if (!order) throw new AppError(404, 'NOT_FOUND');
    const ticked = new Set(delivered);
    if (order.lines.some((line) => !ticked.has(line.position))) {
      throw new AppError(409, 'DELIVERY_INCOMPLETE');
    }

    const lines = [...order.lines].sort((a, b) => (a.productId < b.productId ? -1 : 1));
    const products = [...new Set(lines.map((line) => line.productId))];
    await tx.$queryRaw`
      SELECT 1 FROM "product_stock" WHERE "product_id" = ANY(${products}::uuid[])
       ORDER BY "product_id" FOR UPDATE`;
    for (const line of lines) {
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          type: 'DELIVERY',
          qty: line.baseQty.negated(),
          productUnitId: line.productUnitId,
          unitQty: line.qty,
          orderId: id,
          userId: actor.userId,
        },
      });
    }
    const now = new Date();
    for (const productId of products) {
      const qty = lines
        .filter((line) => line.productId === productId)
        .reduce((sum, line) => sum.plus(line.baseQty), new Prisma.Decimal(0));
      await tx.productStock.update({
        where: { productId },
        data: { onHand: { decrement: qty }, reserved: { decrement: qty } },
      });
    }
    await tx.reservation.updateMany({
      where: { orderId: id, status: 'ACTIVE' },
      data: { status: 'CONSUMED', closedAt: now },
    });
    await tx.$executeRaw`
      UPDATE "order_lines" SET "delivered_qty" = "qty" WHERE "order_id" = ${id}::uuid`;
    await tx.order.update({
      where: { id },
      data: { status: 'DELIVERED', deliveredAt: now, version: { increment: 1 } },
    });
    await tx.delivery.update({ where: { id: held.delivery.id }, data: { deliveredAt: now } });
    const after = await loadOrder(tx, id);
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.delivered',
      entityType: 'order',
      entityId: id,
      before: { status: 'READY' },
      after: {
        status: 'DELIVERED',
        stockOut: order.lines.map((line) => ({
          sku: line.sku,
          qty: line.qty.toFixed(),
          unit: line.unitLabel,
          baseQty: line.baseQty.toFixed(2),
        })),
      },
    });
    return after;
  });
}
