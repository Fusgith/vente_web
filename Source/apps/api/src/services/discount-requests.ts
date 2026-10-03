import type {
  DiscountEntry,
  DiscountRequest,
  DiscountRequestCreate,
  DiscountRequestList,
  Order,
  OrderStatus,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import {
  ORDER_INCLUDE,
  REQUEST_SELECT,
  findOrder,
  pendingRequest,
  toOrder,
  toRequestSummary,
  usedCode,
  type StoredOrder,
} from './order-view.js';
import { dayEndTime, loadOrder } from './orders.js';
import { readSetting } from './settings.js';
import { nextShopTime, shopDayStart } from './shop-time.js';

/** The seed's list, while the admin has not set `discount_reasons` (H51). */
const DEFAULT_REASONS = ['Client fidèle', 'Achat en volume', 'Article abîmé', 'Geste commercial'];

export async function discountReasons(db: Db): Promise<string[]> {
  const value = await readSetting(db, 'discount_reasons');
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((reason) => typeof reason === 'string')
    ? (value as string[])
    : DEFAULT_REASONS;
}

/**
 * The order row locked: a request, its decision, a payment or a cancellation of it wait for one
 * another — always the order first, then its request.
 */
export async function lockOrder(tx: AuditTx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
}

/** The request as the owner reads it, with its order whole (RG-DSH-05). */
const VIEW_SELECT = {
  ...REQUEST_SELECT,
  decidedBy: { select: { id: true, fullName: true } },
  withdrawnBy: { select: { id: true, fullName: true } },
  code: { select: { code: true } },
  order: { include: ORDER_INCLUDE },
} satisfies Prisma.DiscountRequestSelect;
type StoredView = Prisma.DiscountRequestGetPayload<{ select: typeof VIEW_SELECT }>;

function toView(row: StoredView): DiscountRequest {
  return {
    ...toRequestSummary(row),
    decidedBy: row.decidedBy,
    withdrawnBy: row.withdrawnBy,
    code: row.code?.code ?? null,
    order: toOrder(row.order),
  };
}

export async function findRequest(db: AuditTx, id: string): Promise<DiscountRequest> {
  return toView(await db.discountRequest.findUniqueOrThrow({ where: { id }, select: VIEW_SELECT }));
}

/** Where a request may be made, and by whom (H51). */
const OPEN_STATUSES: ReadonlySet<OrderStatus> = new Set(['DRAFT', 'SUBMITTED', 'AT_REGISTER']);

/**
 * The salesperson on their own quote or order in the queue, the cashier on the order at their
 * register, the manager on any of them (H51).
 */
function assertMayAsk(actor: Actor, order: StoredOrder): void {
  const { status } = order;
  if (actor.activeRole === 'sales') {
    if (order.salesUserId !== actor.userId) throw new AppError(403, 'AUTH_FORBIDDEN');
    if (status === 'DRAFT' || status === 'SUBMITTED') return;
  }
  if (actor.activeRole === 'cashier' && status === 'AT_REGISTER') {
    if (order.cashierUserId === actor.userId) return;
  }
  if (actor.activeRole === 'manager' && OPEN_STATUSES.has(status)) return;
  throw new AppError(409, 'DISCOUNT_REQUEST_NOT_ALLOWED');
}

const asked = (entry: DiscountEntry) =>
  entry.kind === 'pct' ? { requestedPct: entry.value } : { requestedAmount: entry.value };

/**
 * An exceptional discount asked of the owner (RG-REM-03, H51): products of the order — all
 * their sale units — and/or its total, with a reason of the list. One request at a time, none
 * once a code is used; it expires at the next day end. The order's version moves on: a payment
 * or a code typed meanwhile is refused (H52).
 */
export async function createDiscountRequest(
  db: Db,
  actor: Actor,
  input: DiscountRequestCreate,
  now = new Date(),
): Promise<{ order: Order; requestId: string }> {
  if (!(await discountReasons(db)).includes(input.reason)) {
    throw new AppError(400, 'DISCOUNT_REASON_UNKNOWN');
  }
  const expiresAt = nextShopTime(now, await dayEndTime(db));

  return db.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId);
    const order = await findOrder(tx, input.orderId);
    if (!order) throw new AppError(404, 'NOT_FOUND');
    assertMayAsk(actor, order);
    const draft = order.status === 'DRAFT';
    if (order.version !== input.version) {
      throw new AppError(409, draft ? 'QUOTE_CHANGED' : 'ORDER_CHANGED');
    }
    // Single use (H42): the code's grants are the owner's answer already.
    if (usedCode(order)) throw new AppError(409, draft ? 'QUOTE_HAS_CODE' : 'ORDER_HAS_CODE');
    if (pendingRequest(order)) throw new AppError(409, 'DISCOUNT_REQUEST_PENDING');
    const onOrder = new Set(order.lines.map((line) => line.productId));
    if (input.items.some((item) => item.productId !== null && !onOrder.has(item.productId))) {
      throw new AppError(422, 'DISCOUNT_REQUEST_PRODUCT_INVALID');
    }
    const items = input.items.map((item) => ({
      productId: item.productId,
      ...asked(item.discount),
    }));
    const note = input.note === '' ? null : input.note;
    const { id: requestId } = await tx.discountRequest.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        reason: input.reason,
        note,
        requestedById: actor.userId,
        expiresAt,
        createdAt: now,
        items: { create: items },
      },
      select: { id: true },
    });
    await tx.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_request.created',
      entityType: 'discount_request',
      entityId: requestId,
      after: {
        orderId: order.id,
        customerId: order.customerId,
        note,
        expiresAt: expiresAt.toISOString(),
        items,
      },
      reason: input.reason,
    });
    return { order: await loadOrder(tx, order.id), requestId };
  });
}

/** Closing a request no longer pending, or one past its day end the sweep has not closed yet. */
async function notPending(db: AuditTx, id: string): Promise<AppError> {
  const exists = await db.discountRequest.count({ where: { id } });
  return exists
    ? new AppError(409, 'DISCOUNT_REQUEST_NOT_PENDING')
    : new AppError(404, 'NOT_FOUND');
}

/** The owner says no (RG-REM-03, H53): the order is paid at its discounts within the caps. */
export async function rejectDiscountRequest(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<DiscountRequest> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.discountRequest.updateMany({
      where: { id, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'REJECTED', decidedById: actor.userId, decidedAt: now },
    });
    if (count === 0) throw await notPending(tx, id);
    const request = await findRequest(tx, id);
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_request.rejected',
      entityType: 'discount_request',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'REJECTED', orderId: request.order.id },
    });
    return request;
  });
}

/**
 * The request withdrawn (RG-REM-05, H54): by who made it, by the cashier holding the order —
 * with the customer's agreement —, or by the manager. The order is paid within the caps.
 */
export async function withdrawDiscountRequest(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<Order> {
  const head = await db.discountRequest.findUnique({
    where: { id },
    select: { orderId: true, requestedById: true },
  });
  if (!head) throw new AppError(404, 'NOT_FOUND');

  return db.$transaction(async (tx) => {
    await lockOrder(tx, head.orderId);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: head.orderId },
      select: { status: true, cashierUserId: true },
    });
    const holds = order.status === 'AT_REGISTER' && order.cashierUserId === actor.userId;
    const allowed =
      actor.activeRole === 'manager' ||
      (actor.activeRole === 'cashier' && holds) ||
      head.requestedById === actor.userId;
    if (!allowed) throw new AppError(403, 'AUTH_FORBIDDEN');
    // Past its day end it is the sweep's, and holds the order no more (payment, set-aside).
    const { count } = await tx.discountRequest.updateMany({
      where: { id, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'WITHDRAWN', withdrawnById: actor.userId, withdrawnAt: now },
    });
    if (count === 0) throw new AppError(409, 'DISCOUNT_REQUEST_NOT_PENDING');
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_request.withdrawn',
      entityType: 'discount_request',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'WITHDRAWN', orderId: head.orderId },
    });
    return loadOrder(tx, head.orderId);
  });
}

/** The order cancelled, its pending request goes with it (H54); its id, if any. */
export async function withdrawWithOrder(
  tx: AuditTx,
  actor: Actor,
  orderId: string,
  now: Date,
): Promise<string | null> {
  const pending = await tx.discountRequest.findFirst({
    where: { orderId, status: 'PENDING' },
    select: { id: true },
  });
  if (!pending) return null;
  // Decided meanwhile: the owner's answer stands.
  const { count } = await tx.discountRequest.updateMany({
    where: { id: pending.id, status: 'PENDING' },
    data: { status: 'WITHDRAWN', withdrawnById: actor.userId, withdrawnAt: now },
  });
  if (count === 0) return null;
  await recordAudit(tx, {
    ...by(actor),
    action: 'discount_request.withdrawn',
    entityType: 'discount_request',
    entityId: pending.id,
    before: { status: 'PENDING' },
    after: { status: 'WITHDRAWN', orderId },
    reason: 'order_cancelled',
  });
  return pending.id;
}

export interface ExpiredRequest {
  requestId: string;
  order: { id: string; status: OrderStatus; salesUserId: string };
}

/**
 * Expires the requests still pending at their day end (H54), audited as the system's doing;
 * run with the orders' sweep.
 */
export async function expireDiscountRequests(db: Db, now = new Date()): Promise<ExpiredRequest[]> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; order_id: string }[]>`
        UPDATE "discount_requests" SET "status" = 'EXPIRED'
         WHERE "status" = 'PENDING' AND "expires_at" <= ${now}
        RETURNING "id", "order_id"`;
    for (const row of rows) {
      await recordAudit(tx, {
        action: 'discount_request.expired',
        entityType: 'discount_request',
        entityId: row.id,
        before: { status: 'PENDING' },
        after: { status: 'EXPIRED', orderId: row.order_id },
      });
    }
    const orders = await tx.order.findMany({
      where: { id: { in: rows.map((row) => row.order_id) } },
      select: { id: true, status: true, salesUserId: true },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    return rows.flatMap((row) => {
      const order = byId.get(row.order_id);
      return order ? [{ requestId: row.id, order }] : [];
    });
  });
}

/**
 * What the owner reads (RG-DSH-05, H54): the requests pending, oldest first, and those closed
 * this shop day, the latest closed first. The manager reads them too (RG-DSH-06).
 */
export async function listDiscountRequests(db: Db, now = new Date()): Promise<DiscountRequestList> {
  const since = shopDayStart(now);
  const [pending, closed] = await Promise.all([
    db.discountRequest.findMany({
      where: { status: 'PENDING', expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: VIEW_SELECT,
    }),
    db.discountRequest.findMany({
      where: {
        OR: [
          { decidedAt: { gte: since } },
          { withdrawnAt: { gte: since } },
          { status: 'EXPIRED', expiresAt: { gte: since } },
        ],
      },
      select: VIEW_SELECT,
    }),
  ]);
  // One shop day bounds the read; sorted on the closing, not the making, before the cut.
  const recent = closed
    .map(toView)
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '') || b.id.localeCompare(a.id))
    .slice(0, 100);
  return { pending: pending.map(toView), recent };
}

/**
 * The cashier sets aside the order at their register while the owner decides (H52): back among
 * those waiting, at its place, priority and absences kept — the register calls the next one.
 */
export async function setAside(db: Db, actor: Actor, id: string, now = new Date()): Promise<Order> {
  return db.$transaction(async (tx) => {
    await lockOrder(tx, id);
    const current = await tx.order.findUnique({
      where: { id },
      select: { status: true, cashierUserId: true },
    });
    if (!current) throw new AppError(404, 'NOT_FOUND');
    const own = actor.activeRole === 'manager' || current.cashierUserId === actor.userId;
    if (current.status !== 'AT_REGISTER' || !own) throw new AppError(409, 'ORDER_NOT_AT_REGISTER');
    const pending = await tx.discountRequest.count({
      where: { orderId: id, status: 'PENDING', expiresAt: { gt: now } },
    });
    if (pending === 0) throw new AppError(409, 'DISCOUNT_REQUEST_NOT_PENDING');
    await tx.order.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        cashierUserId: null,
        registerStationId: null,
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.set_aside',
      entityType: 'order',
      entityId: id,
      before: { status: 'AT_REGISTER' },
      after: { status: 'SUBMITTED' },
      reason: 'discount_request_pending',
    });
    return loadOrder(tx, id);
  });
}
