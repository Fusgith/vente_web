/**
 * Exceptional discount requests (RG-REM-03/05, decisions H22, H51 to H54): beyond the caps, one
 * asks the owner a rate or an amount on products — all their sale units — and/or the order total.
 * The owner grants item by item, which issues a code attached to the order at once (H17), or
 * rejects; until then the order is not paid.
 */
import { z } from 'zod';

import { grantSchema } from './discount-codes.js';
import { discountEntrySchema } from './discount.js';

const uuid = z.uuid();
const instant = z.iso.datetime({ offset: true });
const person = z.object({ id: uuid, fullName: z.string() });

/** At most this many characters in the free note of a request. */
export const DISCOUNT_REQUEST_NOTE_MAX = 300;

export const discountRequestStatusSchema = z.enum([
  'PENDING',
  'GRANTED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
]);
export type DiscountRequestStatus = z.infer<typeof discountRequestStatusSchema>;

export const discountRequestItemInputSchema = z.object({
  /** Null: the order total. */
  productId: uuid.nullable(),
  discount: grantSchema,
});
export type DiscountRequestItemInput = z.infer<typeof discountRequestItemInputSchema>;

/**
 * A request on a quote or an order, with the version read (H51): products of its lines and/or
 * its total, each once; the reason is one of `discount_reasons`, the note optional.
 */
export const discountRequestCreateSchema = z.object({
  orderId: uuid,
  version: z.int().positive(),
  items: z
    .array(discountRequestItemInputSchema)
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length),
  reason: z.string().trim().min(1).max(60),
  note: z.string().trim().max(DISCOUNT_REQUEST_NOTE_MAX).nullable(),
});
export type DiscountRequestCreate = z.infer<typeof discountRequestCreateSchema>;

/**
 * The owner's answer (H53): every item of the request once, granted — as asked or otherwise —
 * or not (`discount: null`); one at least is granted, else the owner rejects.
 */
export const discountRequestGrantSchema = z.object({
  items: z
    .array(z.object({ itemId: uuid, discount: grantSchema.nullable() }))
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((item) => item.itemId)).size === items.length)
    .refine((items) => items.some((item) => item.discount !== null)),
});
export type DiscountRequestGrant = z.infer<typeof discountRequestGrantSchema>;

export const discountRequestItemSchema = z.object({
  id: uuid,
  /** Null: the order total. */
  product: z.object({ id: uuid, sku: z.string(), name: z.string() }).nullable(),
  requested: discountEntrySchema,
  /** What the owner granted on it; null while pending, or when not granted. */
  granted: discountEntrySchema.nullable(),
});
export type DiscountRequestItem = z.infer<typeof discountRequestItemSchema>;

/** The latest request of an order, shown on the quote, at the register and to the owner. */
export const discountRequestSummarySchema = z.object({
  id: uuid,
  status: discountRequestStatusSchema,
  reason: z.string(),
  note: z.string().nullable(),
  /** Products first, by code, then the total (product null). */
  items: z.array(discountRequestItemSchema),
  requestedBy: person,
  createdAt: instant,
  /** The next end of the shop day: still pending then, it expires (H54). */
  expiresAt: instant,
  /** Decided, withdrawn or expired. */
  closedAt: instant.nullable(),
});
export type DiscountRequestSummary = z.infer<typeof discountRequestSummarySchema>;

/** The reasons offered (setting `discount_reasons`, H51). */
export const discountReasonsSchema = z.object({ reasons: z.array(z.string()) });
export type DiscountReasons = z.infer<typeof discountReasonsSchema>;
