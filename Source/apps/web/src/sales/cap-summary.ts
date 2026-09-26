import { formatQty, type ProductUnitHit } from '@vente-web/shared';

import { labels } from '../labels.js';

/**
 * The discount cap said once per article: « remise max 5 % », or « remise max 3 à 5 % » when its
 * priced units differ. Null when no priced unit has a cap.
 */
export function capSummary(units: readonly ProductUnitHit[]): string | null {
  const caps = units
    .filter((unit) => unit.price !== null && unit.maxDiscountPct !== null)
    .map((unit) => unit.maxDiscountPct as string)
    // Percentages with 2 decimals at most: ordering them as numbers is exact enough.
    .sort((a, b) => Number(a) - Number(b));
  const [min] = caps;
  const max = caps.at(-1);
  if (min === undefined || max === undefined) return null;
  return Number(min) === Number(max)
    ? labels.sales.maxDiscount(formatQty(min))
    : labels.sales.maxDiscountRange(formatQty(min), formatQty(max));
}
