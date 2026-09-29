/**
 * Discount codes issued by the owner (RG-REM-04, decision H22, H41): each grants, beyond the caps,
 * a rate or an amount on products — all their sale units — and/or the order total; single use,
 * valid until the next day end.
 */
import { z } from 'zod';

import { discountEntrySchema } from './discount.js';

const uuid = z.uuid();
const instant = z.iso.datetime({ offset: true });

/** What a code is made of: no 0, O, 1, I nor L, which one reads for another (H41). */
export const DISCOUNT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** « r7k4 29qp », « R7K4-29QP » → « R7K429QP »: case, spaces and hyphens do not count. */
export function normalizeDiscountCode(typed: string): string {
  return typed.toUpperCase().replace(/[\s-]/g, '');
}

/** « R7K429QP » → « R7K4-29QP »: groups of 4, as printed and stored. */
export function groupDiscountCode(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join('-');
}

/** A grant is never nothing: a rate or an amount above 0. */
const grantSchema = discountEntrySchema.refine((entry) => /[1-9]/.test(entry.value));

export const discountCodeItemInputSchema = z.object({
  /** Null: the order total. */
  productId: uuid.nullable(),
  discount: grantSchema,
});
export type DiscountCodeItemInput = z.infer<typeof discountCodeItemInputSchema>;

/** A code issued without a request names its customer (RG-REM-04); a product once, the total once. */
export const discountCodeIssueSchema = z.object({
  customerId: uuid,
  items: z
    .array(discountCodeItemInputSchema)
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((item) => item.productId)).size === items.length),
});
export type DiscountCodeIssue = z.infer<typeof discountCodeIssueSchema>;

export const discountCodeStatusSchema = z.enum(['ACTIVE', 'USED', 'EXPIRED', 'REVOKED']);
export type DiscountCodeStatus = z.infer<typeof discountCodeStatusSchema>;

export const discountCodeSchema = z.object({
  id: uuid,
  code: z.string(),
  status: discountCodeStatusSchema,
  customer: z.object({ id: uuid, name: z.string(), phone: z.string() }).nullable(),
  orderId: uuid.nullable(),
  issuedAt: instant,
  expiresAt: instant,
  usedAt: instant.nullable(),
  revokedAt: instant.nullable(),
  /** Products first, by code, then the total (product null). */
  items: z.array(
    z.object({
      product: z.object({ id: uuid, sku: z.string(), name: z.string() }).nullable(),
      discount: discountEntrySchema,
    }),
  ),
});
export type DiscountCode = z.infer<typeof discountCodeSchema>;

/** The codes issued this shop day and those still active, newest first. */
export const discountCodeListSchema = z.object({ items: z.array(discountCodeSchema) });
export type DiscountCodeList = z.infer<typeof discountCodeListSchema>;
