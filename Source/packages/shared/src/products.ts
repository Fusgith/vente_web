/**
 * Products on screen (T-092, T-019, T-019b; RG-ART-01 à 07, H65): the boss or the manager creates
 * a product with its base unit, adds sale units, sets dated prices, deactivates — never deletes.
 * Money, quantities and factors travel as decimal strings (RG-FMT-01).
 */
import { z } from 'zod';

import { customerTypeSchema } from './customers.js';

/** At most three active sale units per product, base unit included (H65). */
export const MAX_ACTIVE_UNITS = 3;
export const PRODUCT_LIST_PAGE = 50;

const uuid = z.uuid();
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);
/** A positive amount with at most 2 decimals: a sale price is never 0 (RG-PAY-02, H50). */
const price = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0);
/** Base units per sale unit: > 0, at most 3 decimals (RG-ART-06). */
const factor = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0);
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

export const productCreateSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  categoryId: uuid.nullable(),
  /** The counting unit (pièce, kg…), also the first sale unit, factor 1 (RG-ART-06). */
  baseUnit: z.string().trim().min(1).max(20),
  alertThreshold: quantity.nullable(),
  barcode: optionalText(64),
  /** Price of the base unit; null = not sellable until one is set (RG-ART-03, H14). */
  price: price.nullable(),
});
export type ProductCreate = z.input<typeof productCreateSchema>;

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  categoryId: uuid.nullable().optional(),
  alertThreshold: quantity.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type ProductUpdate = z.input<typeof productUpdateSchema>;

export const unitCreateSchema = z.object({
  label: z.string().trim().min(1).max(40),
  factor,
  barcode: optionalText(64),
  price: price.nullable(),
});
export type UnitCreate = z.input<typeof unitCreateSchema>;

export const unitUpdateSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  /** Refused once an order uses the unit: create a new unit instead (RG-ART-06). */
  factor: factor.optional(),
  barcode: optionalText(64).optional(),
  isActive: z.boolean().optional(),
});
export type UnitUpdate = z.input<typeof unitUpdateSchema>;

/** Without `customerType`, the base price; with it, that type's own price (H66). */
export const priceSetSchema = z.object({ price, customerType: customerTypeSchema.optional() });
export type PriceSet = z.input<typeof priceSetSchema>;

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  inactive: z.enum(['0', '1']).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const priceEntrySchema = z.object({
  id: uuid,
  price: decimalString,
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  source: z.enum(['IMPORT', 'MANUAL']),
  /** Null = the base price (H66). */
  customerType: customerTypeSchema.nullable(),
  setBy: z.string(),
});
export type PriceEntry = z.infer<typeof priceEntrySchema>;

export const productUnitDetailSchema = z.object({
  id: uuid,
  label: z.string(),
  factor: decimalString,
  isBase: z.boolean(),
  barcode: z.string().nullable(),
  isActive: z.boolean(),
  /** Current price, null = none (not sellable in this unit). */
  price: decimalString.nullable(),
  /** The current price of each customer type that has one (H66). */
  typePrices: z.partialRecord(customerTypeSchema, decimalString),
  /** Some order uses it: its factor is frozen (RG-ART-06). */
  used: z.boolean(),
  /** Newest first (RG-ART-07). */
  prices: z.array(priceEntrySchema),
});
export type ProductUnitDetail = z.infer<typeof productUnitDetailSchema>;

export const productDetailSchema = z.object({
  id: uuid,
  sku: z.string(),
  name: z.string(),
  category: z.object({ id: uuid, name: z.string() }).nullable(),
  baseUnit: z.string(),
  alertThreshold: decimalString.nullable(),
  isActive: z.boolean(),
  onHand: decimalString,
  available: decimalString,
  /** Active first, then by factor. */
  units: z.array(productUnitDetailSchema),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const productRowSchema = z.object({
  id: uuid,
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  baseUnit: z.string(),
  isActive: z.boolean(),
  available: decimalString,
  /** Active units with their current price, smallest factor first. */
  units: z.array(
    z.object({ label: z.string(), factor: decimalString, price: decimalString.nullable() }),
  ),
});
export type ProductRow = z.infer<typeof productRowSchema>;

export const productListSchema = z.object({
  items: z.array(productRowSchema),
  total: z.number().int(),
});
export type ProductList = z.infer<typeof productListSchema>;

/** Price change against the previous one, in % rounded to 1 decimal; null without one. */
export function priceChangePct(previous: string | null, next: string): string | null {
  if (previous === null || Number(previous) === 0) return null;
  return (((Number(next) - Number(previous)) / Number(previous)) * 100).toFixed(1);
}
