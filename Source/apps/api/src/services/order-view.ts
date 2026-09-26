import { lineGross, sumAmounts, type Order, type Quote } from '@vente-web/shared';

import type { Prisma } from '../generated/prisma/client.js';
import type { AuditTx } from './audit.js';

/** What a quote or an order shows: its customer, its salesperson and its lines in order. */
export const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  salesUser: { select: { id: true, fullName: true } },
  lines: {
    orderBy: { position: 'asc' },
    include: { product: { select: { baseUnit: true } } },
  },
} satisfies Prisma.OrderInclude;

export type StoredOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** The table of RG-DEV-05 and its totals, as saved. */
export function toQuote(order: StoredOrder): Quote {
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
