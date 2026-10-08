/**
 * Discount rules (RG-REM-*): cap resolution (RG-REM-01) and the quote engine (RG-REM-02/06,
 * RG-DEV-05). Every amount is computed exactly in cents and travels as a 2-decimal string.
 */
import { z } from 'zod';

import { fromScaled, lineGross, toScaled } from './decimal.js';

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

/** Rates carry 2 decimals, like `discount_pct` NUMERIC(5,2). */
const RATE_PATTERN = /^\d{1,3}(?:\.\d{1,2})?$/;
const AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
/** 100 %, in hundredths of a percent. */
const WHOLE = 10_000n;

const isRate = (value: string) => RATE_PATTERN.test(value) && toScaled(value, 2) <= WHOLE;

/** A discount as typed: a rate of its base, or directly an amount in MGA (RG-REM-06). */
export const discountEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pct'), value: z.string().refine(isRate) }),
  z.object({ kind: z.literal('amount'), value: z.string().regex(AMOUNT_PATTERN) }),
]);
export type DiscountEntry = z.infer<typeof discountEntrySchema>;

/** Stored on lines and orders as `discount_source`: RULE, a suggested discount (H62). */
export type DiscountSource = 'NONE' | 'WITHIN_CAP' | 'RULE' | 'CODE';

const money = (value: bigint) => fromScaled(value, 2);
const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n);
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const floorZero = (value: bigint) => (value < 0n ? 0n : value);
/** Descending order of bigints, for `Array.sort`. */
const descending = (a: bigint, b: bigint) => (a < b ? 1 : a > b ? -1 : 0);

/** Rate in hundredths of a percent, checked: at most 100 % and 2 decimals. */
function rate(value: string): bigint {
  if (!isRate(value)) throw new RangeError(`Not a discount rate: "${value}"`);
  return toScaled(value, 2);
}

/** `rateHundredths` of `base` cents, rounded half-up to the cent (RG-DEV-05). */
function rateOf(base: bigint, rateHundredths: bigint): bigint {
  return (2n * base * rateHundredths + WHOLE) / (2n * WHOLE);
}

function entryCents(entry: DiscountEntry, base: bigint): bigint {
  if (!discountEntrySchema.safeParse(entry).success) {
    throw new RangeError(`Not a discount: ${JSON.stringify(entry)}`);
  }
  return entry.kind === 'pct' ? rateOf(base, toScaled(entry.value, 2)) : toScaled(entry.value, 2);
}

/** Amount an entry takes off `base`: a rate becomes an amount rounded half-up (RG-DEV-05). */
export function discountAmount(entry: DiscountEntry, base: string): string {
  return money(entryCents(entry, toScaled(base, 2)));
}

/** Rate an amount represents on `base`, rounded half-up to 2 decimals: the % of the Remise column. */
export function discountRate(amount: string, base: string): string {
  const baseCents = toScaled(base, 2);
  if (baseCents === 0n) return '0.00';
  return money((2n * toScaled(amount, 2) * WHOLE + baseCents) / (2n * baseCents));
}

/**
 * Splits `total` over `weights` pro rata: each share is rounded down to the cent, then the cents
 * left go one by one to the largest remainders (ties: largest weight, then first line). Shares
 * add up exactly and none exceeds its pro-rata value rounded up, so none is negative or goes
 * beyond the weight it was measured against (RG-REM-06).
 */
function splitProRata(total: bigint, weights: readonly bigint[]): bigint[] {
  const whole = sum(weights);
  if (total === 0n || whole === 0n) return weights.map(() => 0n);
  const parts = weights.map((weight) => ({
    weight,
    share: (total * weight) / whole,
    rest: (total * weight) % whole,
  }));
  let left = total - sum(parts.map((part) => part.share));
  const byRest = [...parts].sort(
    (a, b) => descending(a.rest, b.rest) || descending(a.weight, b.weight),
  );
  for (const part of byRest) {
    if (left === 0n) break;
    part.share += 1n;
    left -= 1n;
  }
  return parts.map((part) => part.share);
}

/** What an owner's code grants (RG-REM-04, H41): on a product — all its sale units — or, null, on the total. */
export interface CodeGrant {
  productId: string | null;
  discount: DiscountEntry;
}

/** The grants of a code laid on the lines of a quote, and on its total. */
export interface GrantedDiscounts {
  lines: (DiscountEntry | null)[];
  order: DiscountEntry | null;
}

/**
 * An owner's code over the lines of a quote (RG-REM-04, H41): a rate on a product holds for each
 * of its lines; an amount on a product sold in several lines (several sale units) is split over
 * them pro rata of their gross, to the cent. A line whose product the code does not name gets
 * nothing; the total's grant goes to the order discount.
 */
export function grantsFor(
  grants: readonly CodeGrant[],
  lines: readonly { productId: string; quantity: string; unitPrice: string }[],
): GrantedDiscounts {
  const granted: (DiscountEntry | null)[] = lines.map(() => null);
  for (const grant of grants) {
    if (grant.productId === null) continue;
    const covered = lines.flatMap((line, index) =>
      line.productId === grant.productId ? [index] : [],
    );
    if (grant.discount.kind === 'pct') {
      for (const index of covered) granted[index] = grant.discount;
      continue;
    }
    const grosses = covered.map((index) => {
      const line = lines[index];
      return line ? toScaled(lineGross(line.quantity, line.unitPrice), 2) : 0n;
    });
    const shares = splitProRata(toScaled(grant.discount.value, 2), grosses);
    covered.forEach((index, at) => {
      granted[index] = { kind: 'amount', value: money(shares[at] ?? 0n) };
    });
  }
  return {
    lines: granted,
    order: grants.find((grant) => grant.productId === null)?.discount ?? null,
  };
}

/** A grant applied on `base`: an amount beyond it comes down to it, never below zero. */
export function grantOn(grant: DiscountEntry, base: string): DiscountEntry {
  const cents = toScaled(base, 2);
  return grant.kind === 'amount' && toScaled(grant.value, 2) > cents
    ? { kind: 'amount', value: money(cents) }
    : grant;
}

export interface QuoteLineInput {
  /** In the sale unit. */
  quantity: string;
  unitPrice: string;
  /** Cap of the line in %, resolved then frozen on the line (RG-REM-01). */
  capPct: string;
  discount: DiscountEntry | null;
  /** Discount granted on this line by the owner's code (RG-REM-04): it replaces the cap. */
  granted?: DiscountEntry | null;
  /** Rate of the line's suggested discount (H62): the limit is the larger of it and the cap. */
  suggestedPct?: string | null;
}

export interface QuoteInput {
  lines: readonly QuoteLineInput[];
  /** Discount on the subtotal, at most one per quote (RG-REM-06). */
  orderDiscount: DiscountEntry | null;
  /** Discount granted on the total by the owner's code; without one, the headroom bounds it. */
  orderGranted?: DiscountEntry | null;
}

export interface QuoteLineTotals {
  /** Quantity × unit price, rounded half-up once. */
  gross: string;
  discount: string;
  /** Rate shown in the Remise column: as typed, or the equivalent of an amount. */
  discountPct: string;
  /** Largest discount allowed on this line: its cap or its suggested discount, or the code's grant. */
  maxDiscount: string;
  net: string;
  /** Room left under the line's limit once its discount is taken (glossary: discount headroom). */
  headroom: string;
  /** Part of the order discount carried by this line; not printed (RG-REM-06). */
  orderDiscountShare: string;
  source: DiscountSource;
  withinLimit: boolean;
}

export interface QuoteTotals {
  lines: QuoteLineTotals[];
  grossTotal: string;
  lineDiscounts: string;
  /** Sum of the line nets: the base of the order discount. */
  subtotal: string;
  /** Largest order discount: the headroom, or the code's grant — shown before any entry (RG-REM-02). */
  maxOrderDiscount: string;
  orderDiscount: string;
  /** Rate of the order discount when typed as a rate, printed next to it (RG-DEV-05). */
  orderDiscountPct: string | null;
  orderDiscountSource: DiscountSource;
  orderWithinLimit: boolean;
  /** Line discounts + order discount. */
  discountTotal: string;
  /** Subtotal − order discount, before VAT and cash rounding. */
  total: string;
  /** Every discount within its cap or grant: the quote may be saved as it is. */
  withinLimits: boolean;
}

/** A code's grant first; then the suggested discount when it covers the discount (H62). */
function sourceOf(
  discount: bigint,
  granted: DiscountEntry | null | undefined,
  ruled = 0n,
): DiscountSource {
  if (discount === 0n) return 'NONE';
  if (granted) return 'CODE';
  return discount <= ruled ? 'RULE' : 'WITHIN_CAP';
}

/**
 * Totals of a quote with its line and order discounts (RG-REM-06, RG-DEV-05).
 *
 * A line discount is checked against the cap turned into an amount of the gross the same way
 * as a typed rate, so the cap typed as a rate and the maximum shown in MGA always agree; a
 * suggested discount larger than the cap takes its place (H62). The order discount is bounded by
 * the headroom — the limit of each line, in MGA, minus its line
 * discount, never below zero — and spread over the lines pro rata of that headroom, so that no
 * product ends beyond its cap (H23). A code covering the total replaces that bound, and its
 * discount is spread pro rata of the line nets.
 */
export function computeQuote(input: QuoteInput): QuoteTotals {
  const lines = input.lines.map((line) => {
    const gross = toScaled(lineGross(line.quantity, line.unitPrice), 2);
    const capped = rateOf(gross, rate(line.capPct));
    const ruled = line.suggestedPct ? rateOf(gross, rate(line.suggestedPct)) : 0n;
    const ceiling = capped > ruled ? capped : ruled;
    const limit = line.granted ? min(entryCents(line.granted, gross), gross) : ceiling;
    const discount = line.discount ? entryCents(line.discount, gross) : 0n;
    return {
      line,
      gross,
      limit,
      ruled,
      discount,
      net: gross - discount,
      headroom: floorZero(ceiling - discount),
    };
  });

  const subtotal = sum(lines.map((line) => line.net));
  const granted = input.orderGranted;
  const maxOrderDiscount = granted
    ? min(entryCents(granted, floorZero(subtotal)), floorZero(subtotal))
    : sum(lines.map((line) => line.headroom));
  const orderDiscount = input.orderDiscount
    ? entryCents(input.orderDiscount, floorZero(subtotal))
    : 0n;

  const nets = lines.map((line) => floorZero(line.net));
  const weights = granted ? nets : lines.map((line) => line.headroom);
  const shares = splitProRata(orderDiscount, sum(weights) > 0n ? weights : nets);

  const totals = lines.map(({ line, gross, limit, ruled, discount, net, headroom }, index) => ({
    gross: money(gross),
    discount: money(discount),
    discountPct:
      line.discount?.kind === 'pct'
        ? money(toScaled(line.discount.value, 2))
        : discountRate(money(discount), money(gross)),
    maxDiscount: money(limit),
    net: money(net),
    headroom: money(headroom),
    orderDiscountShare: money(shares[index] ?? 0n),
    source: sourceOf(discount, line.granted, ruled),
    withinLimit: discount <= limit,
  }));
  const orderWithinLimit = orderDiscount <= maxOrderDiscount;
  const lineDiscounts = sum(lines.map((line) => line.discount));

  return {
    lines: totals,
    grossTotal: money(sum(lines.map((line) => line.gross))),
    lineDiscounts: money(lineDiscounts),
    subtotal: money(subtotal),
    maxOrderDiscount: money(maxOrderDiscount),
    orderDiscount: money(orderDiscount),
    orderDiscountPct:
      input.orderDiscount?.kind === 'pct' ? money(toScaled(input.orderDiscount.value, 2)) : null,
    orderDiscountSource: sourceOf(orderDiscount, granted),
    orderWithinLimit,
    discountTotal: money(lineDiscounts + orderDiscount),
    total: money(subtotal - orderDiscount),
    withinLimits: orderWithinLimit && totals.every((line) => line.withinLimit),
  };
}
