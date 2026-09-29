import {
  baseQuantity,
  canTransition,
  computeQuote,
  grantsFor,
  type DiscountEntry,
  type Order,
  type OrderAdjust,
  type OrderCancel,
  type QuoteInput,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditSnapshot } from './audit.js';
import { findOrder, grantsOf, toOrder, usedCode, type StoredOrder } from './order-view.js';
import { releaseReservations, shrinkReservations } from './stock-reservation.js';

type StoredLine = StoredOrder['lines'][number];

/** What the audit keeps of an order's lines and totals (RG-AUD-01). */
function snapshot(order: Order): AuditSnapshot {
  return {
    status: order.status,
    lines: order.lines.map((line) => ({
      position: line.position,
      sku: line.sku,
      unit: line.unitLabel,
      qty: line.qty,
      discount: line.discountAmount,
      net: line.net,
    })),
    orderDiscount: order.orderDiscount,
    discountTotal: order.discountTotal,
    total: order.total,
  };
}

/** The order as the register sees it: at this register, in the version the cashier read. */
async function atMyRegister(db: Db, actor: Actor, id: string, version: number) {
  const order = await findOrder(db, id);
  if (!order) throw new AppError(404, 'NOT_FOUND');
  const mine = actor.activeRole === 'manager' || order.cashierUserId === actor.userId;
  if (order.status !== 'AT_REGISTER' || !mine) throw new AppError(409, 'ORDER_NOT_AT_REGISTER');
  if (order.version !== version) throw new AppError(409, 'ORDER_CHANGED');
  return order;
}

interface KeptLine {
  line: StoredLine;
  /** The new quantity, or null when unchanged. */
  lowered: string | null;
}

/** The lines kept, each with its new quantity when lowered; refuses an increase or all removed. */
function keptLines(order: StoredOrder, changes: OrderAdjust['changes']): KeptLine[] {
  const byPosition = new Map(changes.map((change) => [change.position, change.qty]));
  for (const position of byPosition.keys()) {
    if (!order.lines.some((line) => line.position === position)) {
      throw new AppError(409, 'ORDER_CHANGED');
    }
  }
  const kept = order.lines.flatMap((line): KeptLine[] => {
    if (!byPosition.has(line.position)) return [{ line, lowered: null }];
    const qty = byPosition.get(line.position) ?? null;
    if (qty === null) return [];
    // Lower only: an addition goes through the salesperson (RG-CMD-05b).
    if (!line.qty.gt(qty)) throw new AppError(409, 'ORDER_NOT_ADJUSTABLE');
    return [{ line, lowered: qty }];
  });
  if (kept.length === 0) throw new AppError(409, 'ORDER_LAST_LINE');
  return kept;
}

/** A discount as the amount it came to; none when zero. */
const amount = (value: string): DiscountEntry | null =>
  value === '0.00' ? null : { kind: 'amount', value };

/**
 * Totals once lines are lowered or removed (RG-DEV-05, RG-REM-06, H30): a line left as it was
 * keeps its discount to the cent; a lowered one keeps its rate, the discount following the
 * quantity. The order discount keeps its rate when typed as one, its amount otherwise — brought
 * down to the headroom when the remaining lines no longer cover it. Caps are the ones frozen
 * on the lines at validation (RG-CMD-04), or the owner's code used on the order (RG-REM-04).
 */
function recompute(order: StoredOrder, kept: KeptLine[]) {
  const granted = grantsFor(
    grantsOf(usedCode(order)),
    kept.map(({ line, lowered }) => ({
      productId: line.productId,
      quantity: lowered ?? line.qty.toFixed(),
      unitPrice: line.unitPrice.toFixed(2),
    })),
  );
  const input = (orderDiscount: DiscountEntry | null): QuoteInput => ({
    lines: kept.map(({ line, lowered }, index) => ({
      quantity: lowered ?? line.qty.toFixed(),
      unitPrice: line.unitPrice.toFixed(2),
      capPct: line.maxDiscountPct.toFixed(),
      granted: granted.lines[index] ?? null,
      discount:
        lowered === null
          ? amount(line.discountAmount.toFixed(2))
          : line.discountPct.isZero()
            ? null
            : { kind: 'pct', value: line.discountPct.toFixed(2) },
    })),
    orderDiscount,
    orderGranted: granted.order,
  });
  const typed: DiscountEntry | null = order.orderDiscountPct
    ? { kind: 'pct', value: order.orderDiscountPct.toFixed(2) }
    : amount(order.orderDiscountAmount.toFixed(2));
  const totals = computeQuote(input(typed));
  if (totals.orderWithinLimit) return totals;
  return computeQuote(input(amount(totals.maxOrderDiscount)));
}

/**
 * Lowers or removes lines of the order at the cashier's register, before payment (RG-CMD-05b):
 * totals computed again, the stock no longer asked freed, the change audited before → after.
 */
export async function adjustOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version, changes }: OrderAdjust,
): Promise<Order> {
  const order = await atMyRegister(db, actor, id, version);
  const kept = keptLines(order, changes);
  const totals = recompute(order, kept);
  const rows = kept.map(({ line, lowered }, index) => ({
    line,
    lowered,
    position: index + 1,
    computed: totals.lines[index],
  }));

  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, status: 'AT_REGISTER', version },
      data: {
        subtotal: totals.subtotal,
        orderDiscountAmount: totals.orderDiscount,
        orderDiscountPct: totals.orderDiscountPct,
        discountTotal: totals.discountTotal,
        total: totals.total,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new AppError(409, 'ORDER_CHANGED');
    const keptIds = new Set(kept.map(({ line }) => line.id));
    await tx.orderLine.deleteMany({
      where: { orderId: id, id: { notIn: [...keptIds] } },
    });
    for (const { line, lowered, position, computed } of rows) {
      if (!computed) continue;
      const qty = lowered ?? line.qty.toFixed();
      await tx.orderLine.update({
        where: { id: line.id },
        data: {
          position,
          qty,
          baseQty: baseQuantity(qty, line.factor.toFixed()),
          ...(lowered === null
            ? {}
            : {
                discountPct: computed.discountPct,
                discountAmount: computed.discount,
                lineTotal: computed.net,
              }),
          orderDiscountShare: computed.orderDiscountShare,
        },
      });
    }
    await shrinkReservations(
      tx,
      id,
      rows.map(({ line, lowered, position }) => ({
        position,
        productId: line.productId,
        baseQty: baseQuantity(lowered ?? line.qty.toFixed(), line.factor.toFixed()),
      })),
    );
    const after = await findOrder(tx, id);
    if (!after) throw new AppError(404, 'NOT_FOUND');
    const result = toOrder(after);
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.adjusted',
      entityType: 'order',
      entityId: id,
      before: snapshot(toOrder(order)),
      after: snapshot(result),
    });
    return result;
  });
}

/**
 * Cancels an order before payment (RG-ANN-01), with its reason: the salesperson their own, the
 * cashier or the manager any. Its reservations are freed and its ticket closed with it.
 */
export async function cancelOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version, reason }: OrderCancel,
): Promise<Order> {
  const order = await findOrder(db, id);
  if (!order) throw new AppError(404, 'NOT_FOUND');
  if (actor.activeRole === 'sales' && order.salesUserId !== actor.userId) {
    throw new AppError(403, 'AUTH_FORBIDDEN');
  }
  if (order.status === 'DRAFT' || !canTransition(order.status, 'CANCELLED')) {
    throw new AppError(409, 'ORDER_NOT_CANCELLABLE');
  }
  if (order.version !== version) throw new AppError(409, 'ORDER_CHANGED');

  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, status: order.status, version },
      data: {
        status: 'CANCELLED',
        cancelReason: reason,
        expiresAt: null,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new AppError(409, 'ORDER_CHANGED');
    await releaseReservations(tx, id);
    const after = await findOrder(tx, id);
    if (!after) throw new AppError(404, 'NOT_FOUND');
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.cancelled',
      entityType: 'order',
      entityId: id,
      before: { status: order.status },
      after: { status: 'CANCELLED' },
      reason,
    });
    return toOrder(after);
  });
}
