/**
 * Validating a quote into an order (T-032, RG-CMD-02/03/04, RG-TKT-01). The quote as saved
 * becomes the order: its prices are frozen, its stock reserved, a call ticket given, and it
 * enters the register queue — all or nothing, on the server.
 */
import { z } from 'zod';

import { fromScaled, isQuantity, toScaled } from './decimal.js';
import { QUOTE_MAX_LINES, quoteSchema } from './quotes.js';

/** Order lifecycle (CDC métier §5.2). */
export const ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'AT_REGISTER',
  'PAID',
  'PREPARING',
  'READY',
  'ISSUE',
  'DELIVERED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * The transitions of CDC métier §5.2; any other is refused (RG-CMD-06). An absent customer sends
 * the order from the register back to its queue (RG-FIL-04); a customer absent at the delivery
 * counter leaves it READY, called again later (T-060).
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['AT_REGISTER', 'EXPIRED', 'CANCELLED'],
  AT_REGISTER: ['PAID', 'SUBMITTED', 'CANCELLED'],
  PAID: ['PREPARING', 'REFUNDED'],
  // Back in the delivery queue: reassigned by the manager, or absent when called (H34).
  PREPARING: ['READY', 'ISSUE', 'PAID'],
  READY: ['DELIVERED', 'ISSUE', 'PAID'],
  ISSUE: ['READY', 'DELIVERED'],
  DELIVERED: [],
  EXPIRED: ['SUBMITTED'],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** The version read: a quote saved or validated meanwhile elsewhere is never validated blind. */
export const orderSubmitSchema = z.object({ version: z.int().positive() });
export type OrderSubmit = z.infer<typeof orderSubmitSchema>;

/**
 * The hand-over at the counter (RG-LIV-03): the lines ticked, by position, in the version read;
 * every one of them, or it is an issue (T-061).
 */
export const orderDeliverSchema = z.object({
  version: z.int().positive(),
  delivered: z.array(z.int().positive()).min(1).max(200),
});
export type OrderDeliver = z.infer<typeof orderDeliverSchema>;

/** « A15 »: letter of the salesperson, number of the day for that letter (RG-TKT-01). */
export const ticketSchema = z.object({
  letter: z.string().regex(/^[A-Z]$/),
  seq: z.int().positive(),
  /** The shop's day the number belongs to. */
  date: z.iso.date(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export function ticketLabel(ticket: Pick<Ticket, 'letter' | 'seq'>): string {
  return `${ticket.letter}${ticket.seq}`;
}

export const orderSchema = quoteSchema.extend({
  status: orderStatusSchema,
  ticket: ticketSchema.nullable(),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Reservation deadline, the day end (RG-STK-02); null before validation and once paid. */
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Order = z.infer<typeof orderSchema>;

/** A line's claim on the stock of its product, in base unit (RG-ART-06). */
export interface StockDemandLine {
  /** Column N° of the table (from 1). */
  position: number;
  productId: string;
  baseQty: string;
}

export interface ProductDemand {
  productId: string;
  /** Lines of one product summed: two units of the same article draw on one stock (RG-CMD-02). */
  baseQty: string;
  positions: number[];
}

/** Base quantity asked of each product, in the order the products first appear. */
export function demandByProduct(lines: readonly StockDemandLine[]): ProductDemand[] {
  const byProduct = new Map<string, { qty: bigint; positions: number[] }>();
  for (const line of lines) {
    const entry = byProduct.get(line.productId) ?? { qty: 0n, positions: [] };
    entry.qty += toScaled(line.baseQty, 2);
    entry.positions.push(line.position);
    byProduct.set(line.productId, entry);
  }
  return [...byProduct].map(([productId, { qty, positions }]) => ({
    productId,
    baseQty: fromScaled(qty, 2),
    positions,
  }));
}

const baseQuantityString = z.string().regex(/^\d+\.\d{2}$/);

/** A product the order asks more of than is available, for « SAV-001 : 30 disponibles, 36 demandés ». */
export const stockShortageSchema = z.object({
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  baseUnit: z.string(),
  /** In base unit: on hand − reserved by the orders validated and not delivered (RG-STK-01). */
  available: baseQuantityString,
  requested: baseQuantityString,
  /** Positions of its lines. */
  lines: z.array(z.int().positive()),
});
export type StockShortage = z.infer<typeof stockShortageSchema>;

/** Details of `STOCK_UNAVAILABLE`. */
export const stockUnavailableSchema = z.object({ shortages: z.array(stockShortageSchema) });
export type StockUnavailable = z.infer<typeof stockUnavailableSchema>;

/**
 * The products short of stock (RG-CMD-02): validation needs `available ≥ Σ quantity × factor`
 * for each product. A product without stock has none available.
 */
export function shortProducts(
  demand: readonly ProductDemand[],
  available: ReadonlyMap<string, string>,
): { productId: string; available: string; requested: string; lines: number[] }[] {
  return demand.flatMap((product) => {
    const stock = available.get(product.productId) ?? '0.00';
    if (toScaled(stock, 2) >= toScaled(product.baseQty, 2)) return [];
    return [
      {
        productId: product.productId,
        available: fromScaled(toScaled(stock, 2), 2),
        requested: product.baseQty,
        lines: product.positions,
      },
    ];
  });
}

/**
 * Largest quantity of a sale unit, at 2 decimals, that the available stock covers — what the
 * tablet offers when a line asks too much (RG-CMD-02). `'0'` when not even 0,01 fits.
 */
export function fittingQuantity(available: string, factor: string): string {
  const stock = toScaled(available, 2);
  const size = toScaled(factor, 3);
  if (size <= 0n) throw new RangeError(`Factor must be positive: "${factor}"`);
  if (stock <= 0n) return '0';
  // q × factor ≤ available ⇔ q (hundredths) × factor (thousandths) ≤ available (hundredths) × 1000.
  const hundredths = (stock * 1000n) / size;
  return fromScaled(hundredths, 2).replace(/\.?0+$/, '');
}

/**
 * Lines lowered or removed at the register, before payment (RG-CMD-05b): by position, `qty` in
 * the sale unit, lower than it was; `null` removes the line. Never an addition, never a discount
 * changed: those go through the salesperson (T-035).
 */
export const orderAdjustSchema = z.object({
  version: z.int().positive(),
  changes: z
    .array(
      z.object({
        position: z.int().positive(),
        qty: z.string().refine(isQuantity).nullable(),
      }),
    )
    .min(1)
    .max(QUOTE_MAX_LINES)
    .refine((changes) => new Set(changes.map((change) => change.position)).size === changes.length),
});
export type OrderAdjust = z.infer<typeof orderAdjustSchema>;

/** Cancelling before payment needs a reason (RG-ANN-01). */
export const orderCancelSchema = z.object({
  version: z.int().positive(),
  reason: z.string().trim().min(3).max(300),
});
export type OrderCancel = z.infer<typeof orderCancelSchema>;

/** Details of `ORDER_PRICE_CHANGED`: lines whose price in force is no longer the saved one. */
export interface OrderPriceChanged {
  lines: number[];
}
