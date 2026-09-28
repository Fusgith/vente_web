/**
 * Delivery issues (RG-LIV-04, RG-ANN-03, ⚠️ H37): what a warehouse user could not hand over, why,
 * and what the customer gets back when the manager has the rest delivered — each line at what
 * the customer paid for it, never more than the invoice.
 */
import { z } from 'zod';

import { fromScaled, isQuantity, toScaled } from './decimal.js';

export const ISSUE_CAUSES = ['MISSING', 'DAMAGED'] as const;
export const issueCauseSchema = z.enum(ISSUE_CAUSES);
export type IssueCause = z.infer<typeof issueCauseSchema>;

const quantity = z.string().trim().refine(isQuantity);

/** The lines not handed over, by position, in the sale unit, with their cause. */
export const issueLineSchema = z.object({
  position: z.int().positive(),
  qty: quantity,
  cause: issueCauseSchema,
});
export type IssueLine = z.infer<typeof issueLineSchema>;

/** Reported by the warehouse user on the order they prepare or hand over, in the version read. */
export const deliveryIssueReportSchema = z.object({
  version: z.int().positive(),
  lines: z
    .array(issueLineSchema)
    .min(1)
    .max(200)
    .refine((lines) => new Set(lines.map((line) => line.position)).size === lines.length),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((value) => value || null)
    .nullable(),
});
export type DeliveryIssueReport = z.infer<typeof deliveryIssueReportSchema>;

/** The manager's decision, in the version read: back to the queue, or delivered in part. */
export const issueDecisionSchema = z.object({ version: z.int().positive() });
export type IssueDecision = z.infer<typeof issueDecisionSchema>;

/** The issue as the screens show it; `credit` once the manager had the rest delivered. */
export const deliveryIssueSchema = z.object({
  id: z.uuid(),
  reportedBy: z.string(),
  reportedAt: z.string(),
  note: z.string().nullable(),
  lines: z.array(issueLineSchema),
  credit: z
    .object({
      amount: z.string(),
      decidedBy: z.string(),
      /** The credit note, once refunded at the register; null while the refund waits. */
      creditNote: z.object({ id: z.uuid(), number: z.string() }).nullable(),
    })
    .nullable(),
});
export type DeliveryIssue = z.infer<typeof deliveryIssueSchema>;

/**
 * The part of a line not handed over, at what the customer paid for it — its net less its share
 * of the discount on the total — × missing ÷ ordered, half-up to the cent (H37). The whole line
 * exactly when none of it was handed over, so that the sum never exceeds the invoice.
 */
export function creditedAmount(line: { qty: string; paid: string; missing: string }): string {
  const qty = toScaled(line.qty, 2);
  const missing = toScaled(line.missing, 2);
  const paid = toScaled(line.paid, 2);
  if (missing <= 0n || qty <= 0n) return '0.00';
  if (missing >= qty) return fromScaled(paid, 2);
  return fromScaled((2n * paid * missing + qty) / (2n * qty), 2);
}
