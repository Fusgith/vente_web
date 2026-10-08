import {
  computeQuote,
  grantsFor,
  type DiscountEntry,
  type Order,
  type QuoteInput,
  type QuoteTotals,
} from '@vente-web/shared';

const amountOf = (value: string): DiscountEntry | null =>
  /[1-9]/.test(value) ? { kind: 'amount', value } : null;

/** The total's discount as the API keeps it: its rate when typed as one, its amount otherwise. */
export const typedTotal = (order: Order): DiscountEntry | null =>
  order.orderDiscountPct
    ? { kind: 'pct', value: order.orderDiscountPct }
    : amountOf(order.orderDiscount);

/**
 * The order's totals with one discount changed at the register — a line by its position, or the
 * total for null —, as the API computes them (H61): prices and caps frozen at validation, the
 * owner's grants bounding what they cover (RG-REM-04), the other lines at their discount to the
 * cent. A total left as it was is brought down to the headroom the lines leave (H23).
 */
export function discountedTotals(
  order: Order,
  position: number | null,
  discount: DiscountEntry | null,
): QuoteTotals {
  const granted = grantsFor(
    order.discountCode?.items ?? [],
    order.lines.map((line) => ({
      productId: line.productId,
      quantity: line.qty,
      unitPrice: line.unitPrice,
    })),
  );
  const input = (orderDiscount: DiscountEntry | null): QuoteInput => ({
    lines: order.lines.map((line, index) => ({
      quantity: line.qty,
      unitPrice: line.unitPrice,
      capPct: line.capPct,
      granted: granted.lines[index] ?? null,
      discount: line.position === position ? discount : amountOf(line.discountAmount),
    })),
    orderDiscount,
    orderGranted: granted.order,
  });
  if (position === null) return computeQuote(input(discount));
  const kept = computeQuote(input(typedTotal(order)));
  return kept.orderWithinLimit ? kept : computeQuote(input(amountOf(kept.maxOrderDiscount)));
}
