import {
  grantOn,
  groupDiscountCode,
  lineGross,
  normalizeDiscountCode,
  type DiscountCodeAttach,
  type DiscountEntry,
  type Quote,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { CODE_SELECT, findOrder, grantsOf, usedCode } from './order-view.js';
import { asAmount } from './orders.js';
import {
  grantsOn,
  lineRows,
  loadQuote,
  orderAmounts,
  priceLines,
  snapshot,
  totalsWithinCaps,
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
  return order;
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
  const code = await db.discountCode.findUnique({
    where: { code: groupDiscountCode(normalizeDiscountCode(typed)) },
    select: { ...CODE_SELECT, status: true, expiresAt: true, orderId: true, customerId: true },
  });
  if (!code) throw new AppError(422, 'DISCOUNT_CODE_UNKNOWN');
  if (code.status !== 'ACTIVE' || code.expiresAt <= now) {
    throw new AppError(409, 'DISCOUNT_CODE_NOT_ACTIVE');
  }
  if (code.orderId ? code.orderId !== id : code.customerId !== order.customerId) {
    throw new AppError(409, 'DISCOUNT_CODE_OTHER_CUSTOMER');
  }

  const grants = grantsOf(code);
  const priced = await priceLines(
    db,
    order.lines.map((line) => ({
      productUnitId: line.productUnitId,
      qty: line.qty.toFixed(),
      discount: asAmount(line.discountAmount),
    })),
  );
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
    : saved;
  const totals = totalsWithinCaps(applied, orderDiscount, grants);

  return db.$transaction(async (tx) => {
    const before = await loadQuote(tx, id);
    // Single use (RG-REM-05): of two quotes typing the same code, the first one takes it.
    const used = await tx.discountCode.updateMany({
      where: { id: code.id, status: 'ACTIVE', expiresAt: { gt: now } },
      data: { status: 'USED', usedAt: now, usedOnOrderId: id },
    });
    if (used.count === 0) throw new AppError(409, 'DISCOUNT_CODE_NOT_ACTIVE');
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
      action: 'discount_code.used',
      entityType: 'discount_code',
      entityId: code.id,
      before: { status: 'ACTIVE' },
      after: { status: 'USED', orderId: id },
    });
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
