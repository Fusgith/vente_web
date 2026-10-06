import { z } from 'zod';

import { typedSecretSchema } from './auth.js';
import { deliveryIssueSchema } from './delivery-issues.js';
import { orderSchema } from './orders.js';
import { paymentSchema } from './payments.js';

/** A credit note as the screens name it (RG-FAC-05): `AV-2026-000012`. */
export const creditNoteRefSchema = z.object({ id: z.uuid(), number: z.string() });
export type CreditNoteRef = z.infer<typeof creditNoteRefSchema>;

/** A sale found by the number of its invoice, as the customer shows it (H36). */
export const invoiceLookupSchema = z.object({
  invoice: z.object({ id: z.uuid(), number: z.string(), issuedAt: z.string() }),
  order: orderSchema,
  payment: paymentSchema,
  /** Its credit notes, oldest first: reprinted from here, even when the refund reply was lost. */
  creditNotes: z.array(creditNoteRefSchema),
  /** The partial delivery and its credit (H37): refunded here once; null when none. */
  issue: deliveryIssueSchema.nullable(),
});
export type InvoiceLookup = z.infer<typeof invoiceLookupSchema>;

/**
 * Cancelling a paid order before delivery (RG-ANN-02, H36): the reason, the one refund
 * method, and the manager's validation on the spot — their identifier and password (H57).
 */
export const orderRefundSchema = z.object({
  version: z.int().positive(),
  reason: z.string().trim().min(3).max(300),
  refund: z.object({
    methodId: z.uuid(),
    reference: z
      .string()
      .trim()
      .max(80)
      .transform((value) => value || null)
      .nullable(),
  }),
  approval: z.object({
    username: z.string().min(1).max(64),
    password: typedSecretSchema,
  }),
});
export type OrderRefund = z.infer<typeof orderRefundSchema>;

export const refundedOrderSchema = z.object({
  order: orderSchema,
  creditNote: creditNoteRefSchema,
});
export type RefundedOrder = z.infer<typeof refundedOrderSchema>;

/**
 * Refunding what a partial delivery left (RG-ANN-03, H37): the amount frozen by the manager's
 * decision, so no reason and no password — only the one refund method.
 */
export const partialRefundSchema = z.object({
  issueId: z.uuid(),
  refund: orderRefundSchema.shape.refund,
});
export type PartialRefund = z.infer<typeof partialRefundSchema>;
