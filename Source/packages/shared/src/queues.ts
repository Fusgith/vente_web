/**
 * The register and delivery queues (T-040, RG-FIL-01 à 06): who waits, in which order, who is
 * being served. The API orders them; the screens only show and act.
 */
import { z } from 'zod';

import { orderStatusSchema, ticketSchema, type OrderStatus } from './orders.js';
import { queueNameSchema, type QueueName } from './realtime.js';

/** Waiting to be called, then being served (RG-FIL-01); delivery states come with T-060. */
export const QUEUE_STATUSES: Readonly<
  Record<QueueName, { waiting: readonly OrderStatus[]; serving: readonly OrderStatus[] }>
> = {
  register: { waiting: ['SUBMITTED'], serving: ['AT_REGISTER'] },
  delivery: { waiting: ['PAID'], serving: ['PREPARING', 'READY'] },
};

const person = z.object({ id: z.uuid(), fullName: z.string() });
const amount = z.string().regex(/^\d+\.\d{2}$/);

export const queueItemSchema = z.object({
  orderId: z.uuid(),
  number: z.string(),
  status: orderStatusSchema,
  ticket: ticketSchema,
  /** The name goes with the ticket everywhere, for the verbal call (RG-TKT-03, RG-DSP-05). */
  customer: z.object({ name: z.string(), phone: z.string() }),
  salesUser: person,
  total: amount,
  /** Marked by the manager: served before the others, in their own order (RG-FIL-02). */
  priority: z.boolean(),
  noShowCount: z.int().nonnegative(),
  /** Entry in the queue: the wait shown runs from it (RG-FIL-05). */
  submittedAt: z.iso.datetime({ offset: true }),
  calledAt: z.iso.datetime({ offset: true }).nullable(),
  /** Paid, hence in the delivery queue since then (RG-LIV-01). */
  paidAt: z.iso.datetime({ offset: true }).nullable(),
  /** Who serves it, and at which station, once called. */
  servedBy: person.nullable(),
  station: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const queueSchema = z.object({
  queue: queueNameSchema,
  /** Being served (called at a register, or prepared and called at a counter). */
  serving: z.array(queueItemSchema),
  /** In the order they will be called: by rank, which the manager may change. */
  waiting: z.array(queueItemSchema),
});
export type Queue = z.infer<typeof queueSchema>;

const reason = z.string().trim().max(200).optional();

/** The manager moves an order before another one, or last (`beforeId: null`) (RG-FIL-02). */
export const queueMoveSchema = z.object({
  orderId: z.uuid(),
  beforeId: z.uuid().nullable(),
  reason,
});
export type QueueMove = z.infer<typeof queueMoveSchema>;

/** Marked priority, an order goes behind the other priorities, ahead of everyone else. */
export const queuePrioritySchema = z.object({ orderId: z.uuid(), priority: z.boolean(), reason });
export type QueuePriority = z.infer<typeof queuePrioritySchema>;
