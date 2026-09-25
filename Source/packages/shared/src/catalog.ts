/**
 * Quick search and quick entry of products (RG-DEV-06): contracts shared by the API and the PWA.
 * Money, quantities and factors travel as decimal strings (RG-FMT-01), never as floats.
 */
import { z } from 'zod';

/** The list appears from the 2nd character; an exact code or barcode is looked up at any length. */
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
/** At most 8 results, all visible without scrolling; beyond, « Précisez la recherche ». */
export const SEARCH_MAX_RESULTS = 8;
/** Favourites row: best sellers of this salesperson over 30 days, else of the shop. */
export const FAVORITES_COUNT = 12;
export const FAVORITES_DAYS = 30;

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);
const uuid = z.uuid();

export const productSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH),
  categoryId: uuid.optional(),
});
export type ProductSearchQuery = z.infer<typeof productSearchQuerySchema>;

export const favoritesQuerySchema = z.object({ categoryId: uuid.optional() });

export const productUnitHitSchema = z.object({
  id: uuid,
  label: z.string(),
  /** Base units per sale unit (RG-ART-06). */
  factor: decimalString,
  isBase: z.boolean(),
  barcode: z.string().nullable(),
  /** Current price; null = not sellable in this unit until a price is set (RG-ART-03, ⚠️ H14). */
  price: decimalString.nullable(),
  /** Resolved cap (RG-REM-01); null when the active role may not see caps (annexe B). */
  maxDiscountPct: decimalString.nullable(),
});
export type ProductUnitHit = z.infer<typeof productUnitHitSchema>;

export const productHitSchema = z.object({
  id: uuid,
  sku: z.string(),
  name: z.string(),
  category: z.object({ id: uuid, name: z.string() }).nullable(),
  /** Label of the unit the stock is counted in. */
  baseUnit: z.string(),
  /** On hand minus reserved, in base unit (RG-STK-01). */
  available: decimalString,
  /** Active sale units, smallest factor first. */
  units: z.array(productUnitHitSchema),
});
export type ProductHit = z.infer<typeof productHitSchema>;

export const productSearchResultSchema = z.object({
  /** Exact code or barcode: the line to add directly, without showing the list. */
  exact: z.object({ productId: uuid, unitId: uuid }).nullable(),
  items: z.array(productHitSchema).max(SEARCH_MAX_RESULTS),
  /** More products match than shown: ask to refine the search. */
  more: z.boolean(),
});
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;

export const favoritesResultSchema = z.object({
  items: z.array(productHitSchema).max(FAVORITES_COUNT),
});
export type FavoritesResult = z.infer<typeof favoritesResultSchema>;

export const categorySummarySchema = z.object({ id: uuid, name: z.string() });
export const categoriesResultSchema = z.object({ items: z.array(categorySummarySchema) });
export type CategorySummary = z.infer<typeof categorySummarySchema>;

export interface QuickEntry {
  /** Quantity typed before the code, as a decimal string with a dot; null = not given. */
  quantity: string | null;
  /** What to look up: code, barcode or words of the designation. */
  term: string;
}

/**
 * « 12*SAV-001 », « 12 x SAV-001 » or « 2,5 × RIZ-001 »: quantity first (RG-DEV-06 §4).
 * The `x` needs spaces around it, so a code such as `12X40` is never split.
 */
const QUICK_ENTRY_PATTERN = /^(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:[*×]|\s[xX]\s)\s*(\S.*)$/u;

export function parseQuickEntry(text: string): QuickEntry {
  const trimmed = text.trim();
  const match = QUICK_ENTRY_PATTERN.exec(trimmed);
  if (!match) return { quantity: null, term: trimmed };
  const [, typed = '', term = ''] = match;
  const quantity = typed.replace(',', '.');
  // « 0*CODE » is not a quantity: the whole text is searched and finds nothing.
  if (!/[1-9]/.test(quantity)) return { quantity: null, term: trimmed };
  return { quantity, term: term.trim() };
}

/**
 * The unit a direct add goes to when none was scanned (RG-DEV-06 §2, RG-ART-03): the base unit
 * when it has a price, else the smallest priced unit; null when nothing is sellable.
 * `units` come ordered by factor, as in a search hit.
 */
export function defaultSaleUnit<U extends Pick<ProductUnitHit, 'isBase' | 'price'>>(
  units: readonly U[],
): U | null {
  const sellable = units.filter((unit) => unit.price !== null);
  return sellable.find((unit) => unit.isBase) ?? sellable[0] ?? null;
}

/** Words of a search term: letters and digits only, so they never carry LIKE wildcards. */
export function searchTokens(term: string): string[] {
  return term.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 0);
}

const SCALE = 1000n;

/** Decimal string with at most 3 decimals → integer thousandths (exact, no float). */
function toThousandths(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) throw new RangeError(`Not a decimal with at most 3 decimals: "${value}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(3, '0'));
  return sign === '-' ? -scaled : scaled;
}

function fromThousandths(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  const fraction = (magnitude % SCALE).toString().padStart(3, '0').replace(/0+$/, '');
  const whole = (magnitude / SCALE).toString();
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/**
 * Available stock expressed in a sale unit (RG-STK-01): « 150 pièces = 2 cartons + 6 pièces »
 * gives `{ count: '2', rest: '6' }`, the rest staying in base unit.
 */
export function splitInUnit(available: string, factor: string): { count: string; rest: string } {
  const stock = toThousandths(available);
  const size = toThousandths(factor);
  if (size <= 0n) throw new RangeError(`Factor must be positive: "${factor}"`);
  if (stock <= 0n) return { count: '0', rest: fromThousandths(stock) };
  return { count: (stock / size).toString(), rest: fromThousandths(stock % size) };
}
