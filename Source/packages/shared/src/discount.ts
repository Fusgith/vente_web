/**
 * Discount rules (RG-REM-*). T-021 needs the cap shown with every search hit; the discount
 * engine itself (line and order-total discounts, RG-REM-06) comes with T-031.
 */

export interface DiscountCapSources {
  /** Cap of the sale unit, overriding the product's for that unit only (decision H18). */
  unit: string | null;
  product: string | null;
  category: string | null;
  /** Setting `default_max_discount_pct` (0 by default). */
  fallback: string;
}

/** Cap of a sale unit, in %: unit → product → category → setting (RG-REM-01). */
export function resolveDiscountCap(sources: DiscountCapSources): string {
  return sources.unit ?? sources.product ?? sources.category ?? sources.fallback;
}
