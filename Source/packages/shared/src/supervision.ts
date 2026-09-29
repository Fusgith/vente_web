import { z } from 'zod';

import type { OrderStatus } from './orders.js';

/** Validated, neither handed over nor closed: still under way in the shop (RG-DSP-04, ⚠️ H38). */
export const IN_PROGRESS_STATUSES = [
  'SUBMITTED',
  'AT_REGISTER',
  'PAID',
  'PREPARING',
  'READY',
  'ISSUE',
] as const satisfies readonly OrderStatus[];

/** Paid, the goods not yet handed over (RG-DSP-04, ⚠️ H38). */
export const PAID_UNDELIVERED_STATUSES = [
  'PAID',
  'PREPARING',
  'READY',
  'ISSUE',
] as const satisfies readonly OrderStatus[];

const count = z.number().int().nonnegative();
/** Whole minutes; null while no order was served that day. */
const minutes = count.nullable();

/**
 * The manager's day at a glance (RG-DSP-04, ⚠️ H38): the average waits of the orders served
 * since the shop's day began, then what is under way right now.
 */
export const supervisionTodaySchema = z.object({
  /** Validated → called to the register, over the orders called today. */
  registerWait: minutes,
  /** Paid → taken at a counter, over the orders first taken today. */
  deliveryWait: minutes,
  inProgress: count,
  paidUndelivered: z.object({ count, total: z.string().regex(/^\d+\.\d{2}$/) }),
});
export type SupervisionToday = z.infer<typeof supervisionTodaySchema>;
