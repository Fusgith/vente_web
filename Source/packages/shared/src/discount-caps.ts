/**
 * Discount caps set by the owner (RG-REM-01, decision H15): per sale unit, product, category, and
 * the setting `default_max_discount_pct`. Rates are decimal strings in %, 2 decimals, 0 to 100.
 */
import { z } from 'zod';

import { fromScaled, toScaled } from './decimal.js';

const uuid = z.uuid();
const RATE_PATTERN = /^\d{1,3}(?:\.\d{1,2})?$/;
/** A rate as the API returns it, `NUMERIC(5,2)`: « 5.00 ». */
const rate = z.string().regex(/^\d{1,3}\.\d{2}$/);

/** A cap as typed: 0 (no discount) to 100 %, at most 2 decimals. */
export function isCapRate(value: string): boolean {
  return RATE_PATTERN.test(value) && toScaled(value, 2) <= 10_000n;
}

/** « 5 », « 5.5 » → « 5.00 », « 5.50 »: a rate with its 2 decimals, as the API returns it. */
export function capRate(value: string): string {
  return fromScaled(toScaled(value, 2), 2);
}

/** A unit's, product's or category's own cap; null = none, the next level applies. */
export const discountCapInputSchema = z.object({ pct: z.string().refine(isCapRate).nullable() });
export type DiscountCapInput = z.infer<typeof discountCapInputSchema>;

/** The general cap, when neither the product nor its category has one: always a rate. */
export const defaultDiscountCapInputSchema = z.object({ pct: z.string().refine(isCapRate) });
export type DefaultDiscountCapInput = z.infer<typeof defaultDiscountCapInputSchema>;

const categoryCapSchema = z.object({ id: uuid, name: z.string(), maxDiscountPct: rate.nullable() });
export type CategoryCap = z.infer<typeof categoryCapSchema>;

/** The general cap and each active category's, by name. */
export const discountCapsSchema = z.object({
  defaultPct: rate,
  categories: z.array(categoryCapSchema),
});
export type DiscountCaps = z.infer<typeof discountCapsSchema>;

/** One product's caps, level by level, and the cap each active sale unit ends up with. */
export const productDiscountCapsSchema = z.object({
  productId: uuid,
  sku: z.string(),
  name: z.string(),
  maxDiscountPct: rate.nullable(),
  category: categoryCapSchema.nullable(),
  defaultPct: rate,
  units: z.array(
    z.object({
      id: uuid,
      label: z.string(),
      factor: z.string(),
      maxDiscountPct: rate.nullable(),
      /** Unit → product → category → setting (RG-REM-01). */
      effectivePct: rate,
    }),
  ),
});
export type ProductDiscountCaps = z.infer<typeof productDiscountCapsSchema>;
