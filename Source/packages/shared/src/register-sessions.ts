import { z } from 'zod';

import { fromScaled, toScaled } from './decimal.js';
import { registerSessionSchema } from './payments.js';

const AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;

/** What was taken by one payment method during a session (RG-CAI-03). */
export const methodTotalSchema = z.object({
  code: z.string(),
  label: z.string(),
  /** Payments using it. */
  count: z.int().nonnegative(),
  total: z.string(),
});
export type MethodTotal = z.infer<typeof methodTotalSchema>;

/** A register session with what it took, open or closed (RG-CAI-03 à 05, H35). */
export const sessionSummarySchema = registerSessionSchema.extend({
  cashier: z.object({ id: z.uuid(), fullName: z.string() }),
  closedAt: z.string().nullable(),
  byMethod: z.array(methodTotalSchema),
  /** Refunds paid back from this register, by method (RG-ANN-02, H36). */
  refunds: z.array(methodTotalSchema),
  /** Opening float + the part paid in cash − the cash refunded: what the drawer should hold. */
  cashExpected: z.string(),
  countedCash: z.string().nullable(),
  /** Counted − expected: negative when cash is missing. */
  variance: z.string().nullable(),
  note: z.string().nullable(),
  /** Still open, opened on a previous shop day (RG-CAI-05). */
  forgotten: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const currentSessionSummarySchema = z.object({ summary: sessionSummarySchema.nullable() });
export const sessionSummaryListSchema = z.object({ sessions: z.array(sessionSummarySchema) });

/** Closing the session: the cash counted in the drawer, and why it differs if it does. */
export const registerSessionCloseSchema = z.object({
  countedCash: z.string().regex(AMOUNT_PATTERN),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((value) => value || null)
    .nullable(),
});
export type RegisterSessionClose = z.infer<typeof registerSessionCloseSchema>;

/** Counted − expected, signed, to the cent (RG-CAI-03). */
export function cashVariance(counted: string, expected: string): string {
  return fromScaled(toScaled(counted, 2) - toScaled(expected, 2), 2);
}
