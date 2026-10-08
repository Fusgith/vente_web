import {
  baseQuantity,
  canTransition,
  computeQuote,
  grantOn,
  grantsFor,
  lineGross,
  type CodeGrant,
  type DiscountCodeAttach,
  type DiscountEntry,
  type Order,
  type OrderAdjust,
  type OrderCancel,
  type QuoteInput,
  type QuoteTotals,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditSnapshot, type AuditTx } from './audit.js';
import { withdrawWithOrder } from './discount-requests.js';
import { suggestedFor, suggestedOn } from './discount-rules.js';
import {
  findOrder,
  grantsOf,
  pendingRequest,
  toOrder,
  usedCode,
  type StoredOrder,
} from './order-view.js';
import { usableCode, useCode } from './quote-codes.js';
import { assertNotFree, orderAmounts } from './quotes.js';
import { releaseReservations, shrinkReservations } from './stock-reservation.js';

type StoredLine = StoredOrder['lines'][number];

/** What the audit keeps of an order's lines and totals (RG-AUD-01). */
export function snapshot(order: Order): AuditSnapshot {
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
export async function atMyRegister(db: Db, actor: Actor, id: string, version: number) {
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
export const amount = (value: string): DiscountEntry | null =>
  value === '0.00' ? null : { kind: 'amount', value };

/** The order discount as typed: its rate when typed as one, its amount otherwise. */
export const typedOrderDiscount = (order: StoredOrder): DiscountEntry | null =>
  order.orderDiscountPct
    ? { kind: 'pct', value: order.orderDiscountPct.toFixed(2) }
    : amount(order.orderDiscountAmount.toFixed(2));

/** Totals with the order discount kept, brought down to the headroom once it no longer fits. */
export function withinHeadroom(
  input: (orderDiscount: DiscountEntry | null) => QuoteInput,
  typed: DiscountEntry | null,
): QuoteTotals {
  const totals = computeQuote(input(typed));
  if (totals.orderWithinLimit) return totals;
  return computeQuote(input(amount(totals.maxOrderDiscount)));
}

/**
 * Totals once lines are lowered or removed (RG-DEV-05, RG-REM-06, H30): a line left as it was
 * keeps its discount to the cent; a lowered one keeps its rate, the discount following the
 * quantity. The order discount keeps its rate when typed as one, its amount otherwise — brought
 * down to the headroom when the remaining lines no longer cover it. Caps are the ones frozen
 * on the lines at validation (RG-CMD-04), or the owner's code used on the order (RG-REM-04); the
 * suggested discounts are those of the quantities left (H62): a line beyond its limit once its
 * suggested discount is gone comes down to that limit.
 */
function recompute(order: StoredOrder, kept: KeptLine[], suggested: (string | null)[]) {
  const granted = grantsFor(
    grantsOf(usedCode(order)),
    kept.map(({ line, lowered }) => ({
      productId: line.productId,
      quantity: lowered ?? line.qty.toFixed(),
      unitPrice: line.unitPrice.toFixed(2),
    })),
  );
  const typed = kept.map(({ line, lowered }): DiscountEntry | null =>
    lowered === null
      ? amount(line.discountAmount.toFixed(2))
      : line.discountPct.isZero()
        ? null
        : { kind: 'pct', value: line.discountPct.toFixed(2) },
  );
  const input =
    (discounts: (DiscountEntry | null)[]) =>
    (orderDiscount: DiscountEntry | null): QuoteInput => ({
      lines: kept.map(({ line, lowered }, index) => ({
        quantity: lowered ?? line.qty.toFixed(),
        unitPrice: line.unitPrice.toFixed(2),
        capPct: line.maxDiscountPct.toFixed(),
        granted: granted.lines[index] ?? null,
        suggestedPct: suggested[index] ?? null,
        discount: discounts[index] ?? null,
      })),
      orderDiscount,
      orderGranted: granted.order,
    });
  const first = computeQuote(input(typed)(null));
  const limited = typed.map((discount, index) => {
    const line = first.lines[index];
    // A grant keeps its own bound (RG-REM-04).
    return line && !line.withinLimit && !granted.lines[index] ? amount(line.maxDiscount) : discount;
  });
  return withinHeadroom(input(limited), typedOrderDiscount(order));
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
  const suggested = await suggestedFor(
    db,
    order.customerId,
    kept.map(({ line, lowered }) => ({
      productId: line.productId,
      qty: lowered ?? line.qty.toFixed(),
      factor: line.factor.toFixed(),
    })),
  );
  const totals = recompute(order, kept, suggested);
  // The lines left all given away by the owner's code: the order would be free (H50).
  assertNotFree(totals);
  const rows = kept.map(({ line, lowered }, index) => ({
    line,
    lowered,
    position: index + 1,
    computed: totals.lines[index],
  }));

  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, status: 'AT_REGISTER', version },
      data: { ...orderAmounts(totals, usedCode(order)?.id ?? null), version: { increment: 1 } },
    });
    if (count === 0) throw new AppError(409, 'ORDER_CHANGED');
    const keptIds = new Set(kept.map(({ line }) => line.id));
    await tx.orderLine.deleteMany({
      where: { orderId: id, id: { notIn: [...keptIds] } },
    });
    for (const { line, lowered, position, computed } of rows) {
      if (!computed) continue;
      const qty = lowered ?? line.qty.toFixed();
      // Lowered, or brought down to its limit with a suggested discount gone (H62).
      const redone = lowered !== null || computed.discount !== line.discountAmount.toFixed(2);
      await tx.orderLine.update({
        where: { id: line.id },
        data: {
          position,
          qty,
          baseQty: baseQuantity(qty, line.factor.toFixed()),
          ...(redone
            ? {
                discountPct: computed.discountPct,
                discountAmount: computed.discount,
                discountSource: computed.source,
                lineTotal: computed.net,
              }
            : {}),
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
 * Totals with the owner's code typed at the register (H42), on the prices and caps frozen at
 * validation (RG-CMD-04): a line it covers takes its grant — an amount beyond its gross comes down
 * to it —, the others keep theirs to the cent; the total takes the code's grant when covered,
 * else keeps its own, brought down to the headroom the grants leave. The owner's grant on a request
 * goes on the same way, a quote's saved prices included (H53). A line's suggested discount still
 * widens the limit of the lines the code leaves (H62).
 */
export function withCode(
  order: StoredOrder,
  grants: readonly CodeGrant[],
  nothing:
    | 'DISCOUNT_CODE_NOTHING_COVERED'
    | 'DISCOUNT_REQUEST_NOTHING_COVERED' = 'DISCOUNT_CODE_NOTHING_COVERED',
  suggested: readonly (string | null)[] = [],
) {
  const granted = grantsFor(
    grants,
    order.lines.map((line) => ({
      productId: line.productId,
      quantity: line.qty.toFixed(),
      unitPrice: line.unitPrice.toFixed(2),
    })),
  );
  if (granted.order === null && granted.lines.every((grant) => grant === null)) {
    throw new AppError(422, nothing);
  }
  const input = (orderDiscount: DiscountEntry | null): QuoteInput => ({
    lines: order.lines.map((line, index) => {
      const quantity = line.qty.toFixed();
      const unitPrice = line.unitPrice.toFixed(2);
      const grant = granted.lines[index] ?? null;
      return {
        quantity,
        unitPrice,
        capPct: line.maxDiscountPct.toFixed(),
        granted: grant,
        suggestedPct: suggested[index] ?? null,
        discount: grant
          ? grantOn(grant, lineGross(quantity, unitPrice))
          : amount(line.discountAmount.toFixed(2)),
      };
    }),
    orderDiscount,
    orderGranted: granted.order,
  });
  if (!granted.order) return { granted, totals: withinHeadroom(input, typedOrderDiscount(order)) };
  const { subtotal } = computeQuote(input(null));
  return { granted, totals: computeQuote(input(grantOn(granted.order, subtotal))) };
}

/**
 * The code's grants written on the order as read, guarded on its state and version: the lines it
 * covers take them, the others keep their discount as saved, their rate included.
 */
export async function writeGrants(
  tx: AuditTx,
  order: StoredOrder,
  { granted, totals }: ReturnType<typeof withCode>,
  codeId: string,
): Promise<void> {
  const { count } = await tx.order.updateMany({
    where: { id: order.id, status: order.status, version: order.version },
    data: { ...orderAmounts(totals, codeId), version: { increment: 1 } },
  });
  if (count === 0) {
    throw new AppError(409, order.status === 'DRAFT' ? 'QUOTE_CHANGED' : 'ORDER_CHANGED');
  }
  for (const [index, line] of order.lines.entries()) {
    const computed = totals.lines[index];
    if (!computed) continue;
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        ...(granted.lines[index]
          ? {
              discountPct: computed.discountPct,
              discountAmount: computed.discount,
              discountSource: computed.source,
              discountCodeId: codeId,
              lineTotal: computed.net,
            }
          : {}),
        orderDiscountShare: computed.orderDiscountShare,
      },
    });
  }
}

/**
 * The owner's code typed at the register, before payment (RG-CMD-05b, RG-REM-04, H42): checked
 * as on the tablet — one code per order — and used at once. The lines and total it covers take
 * its grants; the change is audited before → after. Quantities stay: the stock is untouched.
 */
export async function attachOrderCode(
  db: Db,
  actor: Actor,
  id: string,
  { code: typed, version }: DiscountCodeAttach,
  now = new Date(),
): Promise<Order> {
  const order = await atMyRegister(db, actor, id, version);
  if (usedCode(order)) throw new AppError(409, 'ORDER_HAS_CODE');
  // The owner's answer brings its own code (H52, H53).
  if (pendingRequest(order)) throw new AppError(409, 'DISCOUNT_REQUEST_PENDING');
  const code = await usableCode(db, typed, order, now);
  const applied = withCode(
    order,
    grantsOf(code),
    'DISCOUNT_CODE_NOTHING_COVERED',
    await suggestedOn(db, order, now),
  );
  // Refused before it is used: the code stays active for another try (H50).
  assertNotFree(applied.totals, 'DISCOUNT_CODE_FREE_ORDER');

  return db.$transaction(async (tx) => {
    await useCode(tx, actor, code.id, id, now);
    await writeGrants(tx, order, applied, code.id);
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
 * cashier or the manager any. Its reservations are freed and its ticket closed with it; a request
 * awaiting the owner is withdrawn (H54), its id returned for its followers.
 */
export async function cancelOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version, reason }: OrderCancel,
): Promise<{ order: Order; withdrawn: string | null }> {
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
    const withdrawn = await withdrawWithOrder(tx, actor, id, new Date());
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
    return { order: toOrder(after), withdrawn };
  });
}
