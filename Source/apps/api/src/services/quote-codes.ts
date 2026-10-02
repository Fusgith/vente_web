import {
  discountAmount,
  grantOn,
  groupDiscountCode,
  lineGross,
  normalizeDiscountCode,
  type CodeGrant,
  type DiscountCodeAttach,
  type DiscountEntry,
  type OrderPriceChanged,
  type Quote,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { CODE_SELECT, findOrder, grantsOf, pendingRequest, usedCode } from './order-view.js';
import { asAmount } from './orders.js';
import {
  assertNotFree,
  grantsOn,
  lineRows,
  loadQuote,
  orderAmounts,
  priceLines,
  snapshot,
  totalsWithinCaps,
  type PricedLine,
} from './quotes.js';

/** The quote the code goes on: a draft of this salesperson (or any for the manager), unchanged. */
async function draftToCode(db: Db, actor: Actor, id: string, version: number) {
  const order = await findOrder(db, id);
  if (!order) throw new AppError(404, 'NOT_FOUND');
  if (order.status !== 'DRAFT') throw new AppError(409, 'QUOTE_NOT_DRAFT');
  if (actor.activeRole === 'sales' && order.salesUserId !== actor.userId) {
    throw new AppError(403, 'AUTH_FORBIDDEN');
  }
  if (order.version !== version) throw new AppError(409, 'QUOTE_CHANGED');
  // One code per order (H42): its grants stay with it until the invoice.
  if (usedCode(order)) throw new AppError(409, 'QUOTE_HAS_CODE');
  // The owner's answer brings its own code (⚠️ H52, H53).
  if (pendingRequest(order)) throw new AppError(409, 'DISCOUNT_REQUEST_PENDING');
  return order;
}

/**
 * The owner's code typed, as it may go on this order (RG-REM-04, H41, H42): known, active and
 * not expired, issued for this very order or for its customer.
 */
export async function usableCode(
  db: Db,
  typed: string,
  order: { id: string; customerId: string },
  now: Date,
) {
  const code = await db.discountCode.findUnique({
    where: { code: groupDiscountCode(normalizeDiscountCode(typed)) },
    select: { ...CODE_SELECT, status: true, expiresAt: true, orderId: true, customerId: true },
  });
  if (!code) throw new AppError(422, 'DISCOUNT_CODE_UNKNOWN');
  if (code.status !== 'ACTIVE' || code.expiresAt <= now) {
    throw new AppError(409, 'DISCOUNT_CODE_NOT_ACTIVE');
  }
  if (code.orderId ? code.orderId !== order.id : code.customerId !== order.customerId) {
    throw new AppError(409, 'DISCOUNT_CODE_OTHER_CUSTOMER');
  }
  return code;
}

/**
 * The code used on the order, inside its transaction (RG-REM-05): single use — of two orders
 * typing the same code, the first one takes it. Audited.
 */
export async function useCode(
  tx: AuditTx,
  actor: Actor,
  codeId: string,
  orderId: string,
  now: Date,
): Promise<void> {
  const used = await tx.discountCode.updateMany({
    where: { id: codeId, status: 'ACTIVE', expiresAt: { gt: now } },
    data: { status: 'USED', usedAt: now, usedOnOrderId: orderId },
  });
  if (used.count === 0) throw new AppError(409, 'DISCOUNT_CODE_NOT_ACTIVE');
  await recordAudit(tx, {
    ...by(actor),
    action: 'discount_code.used',
    entityType: 'discount_code',
    entityId: codeId,
    before: { status: 'ACTIVE' },
    after: { status: 'USED', orderId },
  });
}

/**
 * The saved discount on a total the code does not cover. The grants beyond the caps leave the
 * lines less headroom (H23): a discount that no longer fits comes down to the headroom left, as
 * an amount, and the tablet shows it (H42).
 */
function keptOrderDiscount(
  applied: readonly PricedLine[],
  saved: DiscountEntry | null,
  grants: readonly CodeGrant[],
): DiscountEntry | null {
  if (!saved) return null;
  const { subtotal, maxOrderDiscount } = totalsWithinCaps(applied, null, grants);
  const room = new Prisma.Decimal(maxOrderDiscount);
  if (room.gte(discountAmount(saved, subtotal))) return saved;
  return room.isZero() ? null : { kind: 'amount', value: maxOrderDiscount };
}

/**
 * The owner's code, typed on the tablet, attached to a quote (RG-REM-04/05, H42): active and not
 * expired, issued for this order or for its customer. It is used at once — single use — and each
 * line or total it covers takes its grant, beyond the caps; the others keep their discount.
 */
export async function attachDiscountCode(
  db: Db,
  actor: Actor,
  id: string,
  { code: typed, version }: DiscountCodeAttach,
  now = new Date(),
): Promise<Quote> {
  const order = await draftToCode(db, actor, id, version);
  const code = await usableCode(db, typed, order, now);
  const grants = grantsOf(code);
  const priced = await priceLines(
    db,
    order.lines.map((line) => ({
      productUnitId: line.productUnitId,
      qty: line.qty.toFixed(),
      discount: asAmount(line.discountAmount),
    })),
  );
  // A price changed since the save: the salesperson checks it with the customer first, as on
  // validating (RG-CMD-04) — the grants would otherwise go on prices the screen does not show.
  const changed = order.lines.flatMap((line, index) =>
    priced[index]?.unitPrice === line.unitPrice.toFixed(2) ? [] : [line.position],
  );
  if (changed.length > 0) {
    throw new AppError(409, 'ORDER_PRICE_CHANGED', { lines: changed } satisfies OrderPriceChanged);
  }
  const granted = grantsOn(priced, grants);
  if (granted.order === null && granted.lines.every((grant) => grant === null)) {
    throw new AppError(422, 'DISCOUNT_CODE_NOTHING_COVERED');
  }
  // An amount beyond what it discounts comes down to it: a line to its gross, the total to its
  // subtotal.
  const applied = priced.map((line, index) => {
    const grant = granted.lines[index];
    if (!grant) return line;
    const discount = grantOn(grant, lineGross(line.entry.qty, line.unitPrice));
    return { ...line, entry: { ...line.entry, discount } };
  });
  const saved: DiscountEntry | null = order.orderDiscountPct
    ? { kind: 'pct', value: order.orderDiscountPct.toFixed(2) }
    : asAmount(order.orderDiscountAmount);
  const orderDiscount = granted.order
    ? grantOn(granted.order, totalsWithinCaps(applied, null, grants).subtotal)
    : keptOrderDiscount(applied, saved, grants);
  const totals = totalsWithinCaps(applied, orderDiscount, grants);
  // Refused before it is used: the code stays active for another try (H50).
  assertNotFree(totals, 'DISCOUNT_CODE_FREE_ORDER');

  return db.$transaction(async (tx) => {
    const before = await loadQuote(tx, id);
    await useCode(tx, actor, code.id, id, now);
    const { count } = await tx.order.updateMany({
      where: { id, status: 'DRAFT', version },
      data: { ...orderAmounts(totals, code.id), version: { increment: 1 } },
    });
    if (count === 0) throw new AppError(409, 'QUOTE_CHANGED');
    await tx.orderLine.deleteMany({ where: { orderId: id } });
    await tx.orderLine.createMany({
      data: lineRows(applied, totals, code.id).map((row) => ({ ...row, orderId: id })),
    });
    const quote = await loadQuote(tx, id);
    await recordAudit(tx, {
      ...by(actor),
      action: 'quote.updated',
      entityType: 'order',
      entityId: id,
      before: snapshot(before),
      after: snapshot(quote),
    });
    return quote;
  });
}
