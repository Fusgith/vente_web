import { lineGross, sumAmounts, type CodeGrant, type Order, type Quote } from '@vente-web/shared';

import type { Prisma } from '../generated/prisma/client.js';
import type { AuditTx } from './audit.js';

/** An owner's code and what it grants (RG-REM-04, H41). */
export const CODE_SELECT = {
  id: true,
  code: true,
  items: { select: { productId: true, pct: true, amount: true } },
} satisfies Prisma.DiscountCodeSelect;
export type StoredCode = Prisma.DiscountCodeGetPayload<{ select: typeof CODE_SELECT }>;

/** What a code grants, each item a rate or an amount (CHECK). */
export function grantsOf(code: StoredCode | null): CodeGrant[] {
  return (code?.items ?? []).map((item) => ({
    productId: item.productId,
    discount: item.pct
      ? { kind: 'pct', value: item.pct.toFixed(2) }
      : { kind: 'amount', value: item.amount?.toFixed(2) ?? '0.00' },
  }));
}

/** What a quote or an order shows: its customer, its salesperson and its lines in order. */
export const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  salesUser: { select: { id: true, fullName: true } },
  lines: {
    orderBy: { position: 'asc' },
    include: { product: { select: { baseUnit: true } } },
  },
  // Single use: one code at most is used on an order (T-034b).
  codesUsedHere: { select: CODE_SELECT, take: 1 },
} satisfies Prisma.OrderInclude;

export type StoredOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** The owner's code used on this order, if any (RG-REM-04). */
export const usedCode = (order: StoredOrder): StoredCode | null => order.codesUsedHere[0] ?? null;

/** The table of RG-DEV-05 and its totals, as saved. */
export function toQuote(order: StoredOrder): Quote {
  const code = usedCode(order);
  const lines = order.lines.map((line) => {
    const qty = line.qty.toFixed();
    const unitPrice = line.unitPrice.toFixed(2);
    return {
      position: line.position,
      productId: line.productId,
      productUnitId: line.productUnitId,
      sku: line.sku,
      name: line.name,
      unitLabel: line.unitLabel,
      factor: line.factor.toFixed(),
      baseUnit: line.product.baseUnit,
      qty,
      unitPrice,
      capPct: line.maxDiscountPct.toFixed(),
      gross: lineGross(qty, unitPrice),
      discountPct: line.discountPct.toFixed(2),
      discountAmount: line.discountAmount.toFixed(2),
      discountSource: line.discountSource,
      net: line.lineTotal.toFixed(2),
    };
  });
  return {
    id: order.id,
    number: order.number,
    version: order.version,
    customer: order.customer,
    salesUser: order.salesUser,
    lines,
    grossTotal: sumAmounts(lines.map((line) => line.gross)),
    lineDiscounts: sumAmounts(lines.map((line) => line.discountAmount)),
    subtotal: order.subtotal.toFixed(2),
    orderDiscountPct: order.orderDiscountPct?.toFixed(2) ?? null,
    orderDiscount: order.orderDiscountAmount.toFixed(2),
    discountTotal: order.discountTotal.toFixed(2),
    discountCode: code ? { code: code.code, items: grantsOf(code) } : null,
    total: order.total.toFixed(2),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/** The ticket's day, as the `date` column holds it: `2026-09-26`. */
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** A quote or an order, whatever its state, with its ticket once validated (RG-TKT-01). */
export function toOrder(order: StoredOrder): Order {
  const { ticketLetter, ticketSeq, ticketDate } = order;
  return {
    ...toQuote(order),
    status: order.status,
    ticket:
      ticketLetter && ticketSeq && ticketDate
        ? { letter: ticketLetter, seq: ticketSeq, date: isoDay(ticketDate) }
        : null,
    submittedAt: order.submittedAt?.toISOString() ?? null,
    expiresAt: order.expiresAt?.toISOString() ?? null,
  };
}

export async function findOrder(db: AuditTx, id: string): Promise<StoredOrder | null> {
  return db.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
}
