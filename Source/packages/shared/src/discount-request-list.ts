/**
 * The requests as the owner reads them (RG-DSH-05, H54), with their order whole: what the
 * owner decides on. Apart from `discount-requests.ts`, which the quote embeds.
 */
import { z } from 'zod';

import { discountRequestSummarySchema } from './discount-requests.js';
import { orderSchema } from './orders.js';

const person = z.object({ id: z.uuid(), fullName: z.string() });

export const discountRequestSchema = discountRequestSummarySchema.extend({
  decidedBy: person.nullable(),
  withdrawnBy: person.nullable(),
  /** The code issued when granted, attached to the order at once (H17). */
  code: z.string().nullable(),
  order: orderSchema,
});
export type DiscountRequest = z.infer<typeof discountRequestSchema>;

/** Pending ones, oldest first; those closed this shop day, newest first. */
export const discountRequestListSchema = z.object({
  pending: z.array(discountRequestSchema),
  recent: z.array(discountRequestSchema),
});
export type DiscountRequestList = z.infer<typeof discountRequestListSchema>;
