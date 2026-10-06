import { z } from 'zod';

export const PROMOTION_PITCH_MAX_LENGTH = 200;

/**
 * The owner marks a product « à proposer » (RG-DEV-06 §6, H46, H49 b): shown to the salespeople
 * from the first shop day to the last, both included.
 */
export const promotionCreateSchema = z.object({
  productId: z.uuid(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  /** What to tell the customer; blank = none. */
  pitch: z.string().trim().max(PROMOTION_PITCH_MAX_LENGTH).optional(),
});
export type PromotionCreate = z.input<typeof promotionCreateSchema>;

export const promotionSchema = z.object({
  id: z.uuid(),
  product: z.object({ id: z.uuid(), sku: z.string(), name: z.string() }),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  pitch: z.string().nullable(),
  withdrawnAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Promotion = z.infer<typeof promotionSchema>;

/** The current and upcoming promotions, the soonest to start first. */
export const promotionListSchema = z.object({ items: z.array(promotionSchema) });
export type PromotionList = z.infer<typeof promotionListSchema>;
