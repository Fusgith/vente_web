import { z } from 'zod';

export const CustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  phone: z.string().min(1).max(32),
  notes: z.string().nullable().optional(),
});
export type CustomerHit = z.infer<typeof CustomerSchema>;

export const CreateCustomerRequest = CustomerSchema.omit({ id: true });
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequest>;

export const SearchCustomersRequest = z.object({
  q: z.string().min(2),
});

export const DiscountEntrySchema = z.object({
  kind: z.enum(['pct', 'amount']),
  value: z.string(),
});

export const SaveQuoteLineRequest = z.object({
  productId: z.string().uuid(),
  productUnitId: z.string().uuid(),
  qty: z.string(),
  unitPrice: z.string(),
  capPct: z.string(),
  discount: DiscountEntrySchema.nullable(),
});

export const SaveQuoteRequest = z.object({
  customerId: z.string().uuid(),
  lines: z.array(SaveQuoteLineRequest).min(1),
  orderDiscount: DiscountEntrySchema.nullable(),
});
export type SaveQuoteRequest = z.infer<typeof SaveQuoteRequest>;

export const SavedQuoteResponse = z.object({
  id: z.string().uuid(),
  number: z.string(),
});
