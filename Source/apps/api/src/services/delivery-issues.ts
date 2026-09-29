import {
  baseQuantity,
  creditedAmount,
  sumAmounts,
  type DeliveryIssue,
  type DeliveryIssueReport,
  type IssueDecision,
  type IssueEntry,
  type Order,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { heldBy } from './deliveries.js';
import { findOrder } from './order-view.js';
import { loadOrder } from './orders.js';
import { lockQueue } from './queues.js';

export const ISSUE_INCLUDE = {
  reportedBy: { select: { fullName: true } },
  decidedBy: { select: { fullName: true } },
  creditNote: { select: { id: true, number: true } },
  lines: {
    include: { orderLine: { select: { position: true, sku: true, name: true, unitLabel: true } } },
  },
} satisfies Prisma.DeliveryIssueInclude;

export type StoredIssue = Prisma.DeliveryIssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

/** The issue as the screens show it, its lines in the order's order. */
export function toIssue(issue: StoredIssue): DeliveryIssue {
  return {
    id: issue.id,
    reportedBy: issue.reportedBy.fullName,
    reportedAt: issue.reportedAt.toISOString(),
    note: issue.note,
    lines: issue.lines
      .map((line) => ({
        position: line.orderLine.position,
        qty: line.qty.toFixed(),
        cause: line.cause,
      }))
      .sort((a, b) => a.position - b.position),
    credit:
      issue.resolution === 'PARTLY_DELIVERED' && issue.creditAmount && issue.decidedBy
        ? {
            amount: issue.creditAmount.toFixed(2),
            decidedBy: issue.decidedBy.fullName,
            creditNote: issue.creditNote,
          }
        : null,
  };
}

/** The partial delivery of an order and its credit, refunded or not (H37). */
export async function partialDelivery(db: AuditTx, orderId: string): Promise<DeliveryIssue | null> {
  const issue = await db.deliveryIssue.findFirst({
    where: { orderId, resolution: 'PARTLY_DELIVERED' },
    include: ISSUE_INCLUDE,
  });
  return issue ? toIssue(issue) : null;
}

/** What the manager follows: the issues to decide, then the credits still to refund (H37). */
export async function listIssues(db: Db): Promise<IssueEntry[]> {
  const issues = await db.deliveryIssue.findMany({
    where: { OR: [{ resolution: null }, { resolution: 'PARTLY_DELIVERED', creditNoteId: null }] },
    orderBy: [{ reportedAt: 'asc' }, { id: 'asc' }],
    include: ISSUE_INCLUDE,
  });
  return Promise.all(
    issues.map(async (issue) => ({
      order: await loadOrder(db, issue.orderId),
      issue: toIssue(issue),
    })),
  );
}

/**
 * Reported at the counter (RG-LIV-04, H37): for each line touched, the quantity not handed
 * over — in its sale unit, at most what was ordered — and its cause. The order waits on the
 * manager in ISSUE, its reservation firm; the counter is free for the next one.
 */
export async function reportIssue(
  db: Db,
  actor: Actor,
  id: string,
  { version, lines, note }: DeliveryIssueReport,
): Promise<Order> {
  return db.$transaction(async (tx) => {
    const held = await heldBy(tx, id);
    const mine = actor.activeRole === 'manager' || held.delivery?.warehouseUserId === actor.userId;
    if (!['PREPARING', 'READY'].includes(held.status) || !held.delivery || !mine) {
      throw new AppError(409, 'ORDER_NOT_AT_COUNTER');
    }
    if (held.version !== version) throw new AppError(409, 'ORDER_CHANGED');
    const order = await findOrder(tx, id);
    if (!order) throw new AppError(404, 'NOT_FOUND');
    const touched = lines.map((line) => {
      const ordered = order.lines.find((candidate) => candidate.position === line.position);
      if (!ordered || ordered.qty.lessThan(line.qty)) throw new AppError(422, 'ISSUE_LINE_INVALID');
      return { ...line, ordered };
    });
    const issue = await tx.deliveryIssue.create({
      data: {
        orderId: id,
        reportedById: actor.userId,
        note,
        lines: {
          create: touched.map((line) => ({
            orderLineId: line.ordered.id,
            qty: line.qty,
            cause: line.cause,
          })),
        },
      },
      select: { id: true },
    });
    await tx.order.update({ where: { id }, data: { status: 'ISSUE', version: { increment: 1 } } });
    await tx.delivery.update({ where: { id: held.delivery.id }, data: { issueNote: note } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.issue',
      entityType: 'order',
      entityId: id,
      before: { status: held.status },
      after: {
        status: 'ISSUE',
        issueId: issue.id,
        lines: touched.map((line) => ({
          sku: line.ordered.sku,
          qty: line.qty,
          unit: line.ordered.unitLabel,
          cause: line.cause,
        })),
      },
      reason: note,
    });
    return loadOrder(tx, id);
  });
}

/** The order in ISSUE, in the version read, and its open issue: the manager decides once. */
async function openIssue(tx: Prisma.TransactionClient, orderId: string, version: number) {
  const [order] = await tx.$queryRaw<{ status: string; version: number }[]>`
    SELECT "status"::text AS "status", "version" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
  if (!order) throw new AppError(404, 'NOT_FOUND');
  if (order.status !== 'ISSUE') throw new AppError(409, 'ORDER_NOT_IN_ISSUE');
  if (order.version !== version) throw new AppError(409, 'ORDER_CHANGED');
  const issue = await tx.deliveryIssue.findFirst({
    where: { orderId, resolution: null },
    include: { lines: true },
  });
  if (!issue) throw new AppError(409, 'ORDER_NOT_IN_ISSUE');
  return issue;
}

/**
 * The goods are there (H37): back in the delivery queue at its place — its rank and its
 * priority kept — for a warehouse user to take it again as any paid order.
 */
export async function requeueIssue(
  db: Db,
  actor: Actor,
  id: string,
  { version }: IssueDecision,
): Promise<Order> {
  return db.$transaction(async (tx) => {
    const issue = await openIssue(tx, id, version);
    await lockQueue(tx, 'delivery');
    await tx.deliveryIssue.update({
      where: { id: issue.id },
      data: { resolution: 'REQUEUED', decidedById: actor.userId, decidedAt: new Date() },
    });
    await tx.order.update({
      where: { id },
      data: { status: 'PAID', readyAt: null, version: { increment: 1 } },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.issue_requeued',
      entityType: 'order',
      entityId: id,
      before: { status: 'ISSUE', issueId: issue.id },
      after: { status: 'PAID' },
    });
    return loadOrder(tx, id);
  });
}

/**
 * Delivered in part (RG-LIV-04, RG-ANN-03, H37): the stock goes out for what was handed over
 * only — one movement per line, in base unit, the stock rows locked in product order — the rest
 * of the reservation freed, the order delivered, and what the customer gets back frozen: each
 * line at what was paid for it × not handed over ÷ ordered, never more than the invoice. The
 * refund itself waits for the customer at the register.
 */
export async function deliverPartly(
  db: Db,
  actor: Actor,
  id: string,
  { version }: IssueDecision,
): Promise<Order> {
  return db.$transaction(async (tx) => {
    const issue = await openIssue(tx, id, version);
    const order = await findOrder(tx, id);
    if (!order) throw new AppError(404, 'NOT_FOUND');
    const missing = new Map(issue.lines.map((line) => [line.orderLineId, line]));
    const lines = order.lines
      .map((line) => {
        const short = missing.get(line.id);
        const delivered = line.qty.minus(short?.qty ?? 0);
        return {
          line,
          short,
          delivered,
          baseOut: short
            ? new Prisma.Decimal(baseQuantity(delivered.toFixed(), line.factor.toFixed()))
            : line.baseQty,
          credit: short
            ? creditedAmount({
                qty: line.qty.toFixed(),
                paid: line.lineTotal.minus(line.orderDiscountShare).toFixed(2),
                missing: short.qty.toFixed(),
              })
            : null,
        };
      })
      .sort((a, b) => (a.line.productId < b.line.productId ? -1 : 1));
    if (lines.every(({ delivered }) => delivered.lte(0))) {
      throw new AppError(409, 'ISSUE_NOTHING_DELIVERED');
    }
    const credited = sumAmounts(lines.flatMap(({ credit }) => (credit ? [credit] : [])));
    const creditAmount = Prisma.Decimal.min(credited, order.total).toFixed(2);

    const products = [...new Set(lines.map(({ line }) => line.productId))];
    await tx.$queryRaw`
      SELECT 1 FROM "product_stock" WHERE "product_id" = ANY(${products}::uuid[])
       ORDER BY "product_id" FOR UPDATE`;
    for (const { line, delivered, baseOut } of lines) {
      if (delivered.lte(0)) continue;
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          type: 'DELIVERY',
          qty: baseOut.negated(),
          productUnitId: line.productUnitId,
          unitQty: delivered,
          orderId: id,
          userId: actor.userId,
        },
      });
    }
    const now = new Date();
    const reservations = await tx.reservation.findMany({
      where: { orderId: id, status: 'ACTIVE' },
      orderBy: { productId: 'asc' },
    });
    for (const reservation of reservations) {
      const out = lines
        .filter(({ line }) => line.productId === reservation.productId)
        .reduce((sum, { baseOut }) => sum.plus(baseOut), new Prisma.Decimal(0));
      await tx.productStock.update({
        where: { productId: reservation.productId },
        data: { onHand: { decrement: out }, reserved: { decrement: reservation.qty } },
      });
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: out.gt(0) ? 'CONSUMED' : 'RELEASED', closedAt: now },
      });
    }
    for (const { line, delivered, short, credit } of lines) {
      await tx.orderLine.update({ where: { id: line.id }, data: { deliveredQty: delivered } });
      if (short) {
        await tx.deliveryIssueLine.update({
          where: { issueId_orderLineId: { issueId: issue.id, orderLineId: line.id } },
          data: { creditAmount: credit },
        });
      }
    }
    await tx.deliveryIssue.update({
      where: { id: issue.id },
      data: {
        resolution: 'PARTLY_DELIVERED',
        decidedById: actor.userId,
        decidedAt: now,
        creditAmount,
      },
    });
    await tx.order.update({
      where: { id },
      data: { status: 'DELIVERED', deliveredAt: now, version: { increment: 1 } },
    });
    const delivery = await tx.delivery.findFirst({
      where: { orderId: id },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (delivery)
      await tx.delivery.update({ where: { id: delivery.id }, data: { deliveredAt: now } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.partly_delivered',
      entityType: 'order',
      entityId: id,
      before: { status: 'ISSUE', issueId: issue.id },
      after: {
        status: 'DELIVERED',
        stockOut: lines
          .filter(({ delivered }) => delivered.gt(0))
          .map(({ line, delivered, baseOut }) => ({
            sku: line.sku,
            qty: delivered.toFixed(),
            unit: line.unitLabel,
            baseQty: baseOut.toFixed(2),
          })),
        credit: creditAmount,
      },
    });
    return loadOrder(tx, id);
  });
}
