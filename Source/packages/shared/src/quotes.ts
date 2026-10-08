/**
 * Saving a quote (T-030, RG-DEV-01/02/05). The tablet sends only what was typed — sale units,
 * quantities and discounts as typed — and the API prices the lines again, resolves the caps and
 * computes every total with the discount engine: nothing the tablet computed is trusted.
 */
import { z } from 'zod';

import { isQuantity } from './decimal.js';
import { discountRequestSummarySchema } from './discount-requests.js';
import { discountEntrySchema } from './discount.js';

/** A technical bound on the request, far beyond a counter sale; not a business rule. */
export const QUOTE_MAX_LINES = 200;

export const quoteLineEntrySchema = z.object({
  productUnitId: z.uuid(),
  /** In the sale unit. */
  qty: z.string().refine(isQuantity),
  discount: discountEntrySchema.nullable(),
});
export type QuoteLineEntry = z.infer<typeof quoteLineEntrySchema>;

export const quoteSaveSchema = z.object({
  /** Mandatory (RG-DEV-04). */
  customerId: z.uuid(),
  lines: z
    .array(quoteLineEntrySchema)
    .min(1)
    .max(QUOTE_MAX_LINES)
    // One line per product × sale unit (RG-DEV-05): the tablet adds to the quantity instead.
    .refine((lines) => new Set(lines.map((line) => line.productUnitId)).size === lines.length),
  orderDiscount: discountEntrySchema.nullable(),
});
export type QuoteSave = z.infer<typeof quoteSaveSchema>;

/** The version read: a quote changed meanwhile on another tablet is never overwritten. */
export const quoteUpdateSchema = quoteSaveSchema.extend({ version: z.int().positive() });
export type QuoteUpdate = z.infer<typeof quoteUpdateSchema>;

const decimalString = z.string().regex(/^\d+(?:\.\d+)?$/);

/** A line as saved, in the columns of RG-DEV-05. */
export const quoteLineSchema = z.object({
  position: z.int().positive(),
  productId: z.uuid(),
  productUnitId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unitLabel: z.string(),
  factor: decimalString,
  /** The article's base unit, for « carton (× 12 pièce) » (RG-ART-04). */
  baseUnit: z.string(),
  qty: decimalString,
  unitPrice: decimalString,
  /** Cap of the line in %, resolved when saved (RG-REM-01). */
  capPct: decimalString,
  gross: decimalString,
  discountPct: decimalString,
  discountAmount: decimalString,
  /** Where the discount comes from, shown to the cashier (§5.6): the cap, a rule (H62), a code. */
  discountSource: z.enum(['NONE', 'WITHIN_CAP', 'RULE', 'CODE']),
  /** Gross − line discount. */
  net: decimalString,
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

/** The owner's code attached to a quote (RG-REM-04, T-034b): what it grants replaces the caps. */
export const quoteCodeSchema = z.object({
  code: z.string(),
  /**
   * The owner's answer to a request (H64): applied straight to the order, shown as « Remise
   * accordée par le boss », its code never; false for a code typed in.
   */
  granted: z.boolean(),
  items: z.array(z.object({ productId: z.uuid().nullable(), discount: discountEntrySchema })),
});
export type QuoteCode = z.infer<typeof quoteCodeSchema>;

export const quoteSchema = z.object({
  id: z.uuid(),
  /** `D-2026-000123` (RG-DEV-02). */
  number: z.string(),
  version: z.int().positive(),
  customer: z.object({ id: z.uuid(), name: z.string(), phone: z.string() }),
  salesUser: z.object({ id: z.uuid(), fullName: z.string() }),
  lines: z.array(quoteLineSchema),
  grossTotal: decimalString,
  lineDiscounts: decimalString,
  subtotal: decimalString,
  /** The rate of the order discount when typed as a rate, printed next to it (RG-DEV-05). */
  orderDiscountPct: decimalString.nullable(),
  orderDiscount: decimalString,
  discountTotal: decimalString,
  /** The owner's code attached, printed on the invoice (RG-REM-07). */
  discountCode: quoteCodeSchema.nullable(),
  /** Its latest request to the owner, pending or closed (RG-REM-03, H54). */
  discountRequest: discountRequestSummarySchema.nullable(),
  total: decimalString,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Quote = z.infer<typeof quoteSchema>;

/** Details of `QUOTE_DISCOUNT_BEYOND_CAP`: which discounts passed their cap, for the screen. */
export interface QuoteBeyondCap {
  /** Positions (from 1) of the lines beyond their cap. */
  lines: number[];
  order: boolean;
}

/** Details of `QUOTE_LINE_UNAVAILABLE`: the positions of the lines that can no longer be sold. */
export interface QuoteUnavailable {
  lines: number[];
}

/** `D-2026-000123`: prefix setting, year of the shop, 6 digits; gaps are tolerated (RG-DEV-02). */
export function quoteNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}
