import { z } from 'zod';

/** Whether the salesperson discounts (setting `sales_discount_enabled`, H60): off by default. */
export const salesDiscountSchema = z.object({ enabled: z.boolean() }).strict();
export type SalesDiscount = z.infer<typeof salesDiscountSchema>;
