/**
 * Realtime events (CDC technique §6.1). They carry identifiers only: a screen that receives one
 * reads the resource again through the API, with its own rights, and never trusts the event's
 * content blindly. WebSocket only, same origin, authenticated by the session cookie (T-018).
 */
import { z } from 'zod';

import { orderStatusSchema } from './orders.js';

export const REALTIME_PATH = '/socket.io';

export const queueNameSchema = z.enum(['register', 'delivery']);
export type QueueName = z.infer<typeof queueNameSchema>;

/** Each event's payload, which a screen checks before using it: an event is a hint, not data. */
export const realtimePayloadSchemas = {
  /** An order entered, was called from, came back to or moved in a queue (RG-FIL-01 à 04). */
  'queue.changed': z.object({
    queue: queueNameSchema,
    orderId: z.uuid(),
    change: z.enum([
      'entered',
      'called',
      'no_show',
      'reordered',
      'updated',
      'cancelled',
      'expired',
      'paid',
      'delivered',
      'released',
    ]),
  }),
  /** Any transition of an order (RG-CMD-06). */
  'order.status_changed': z.object({ orderId: z.uuid(), status: orderStatusSchema }),
  /** A ticket called to a register or a counter (RG-FIL-03, RG-DSP-01/05). */
  'ticket.called': z.object({ queue: queueNameSchema, orderId: z.uuid() }),
  /** A customer absent when called, back in the queue; the manager hears from the 2nd time (RG-FIL-04). */
  'order.no_show': z.object({ orderId: z.uuid(), noShowCount: z.int().positive() }),
};

export type RealtimeEvent = keyof typeof realtimePayloadSchemas;
export type RealtimeEvents = {
  [E in RealtimeEvent]: z.infer<(typeof realtimePayloadSchemas)[E]>;
};
