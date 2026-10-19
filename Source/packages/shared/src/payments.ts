import { z } from 'zod';

import { fromScaled, toScaled } from './decimal.js';
import { invoiceRefSchema } from './invoices.js';
import { orderSchema } from './orders.js';

/** An amount typed at the register: positive or zero, at most 12 digits and 2 decimals. */
const AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,2})?$/;
const amountString = z.string().regex(AMOUNT_PATTERN);
const positiveAmount = amountString.refine((value) => toScaled(value, 2) > 0n);

/** Code of cash in the list of payment methods (RG-PAY-01): the only one giving change. */
export const CASH_METHOD = 'CASH';

/** A payment method offered at the register (RG-PAY-01, RG-PAY-04). */
export const paymentMethodSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  requiresReference: z.boolean(),
});
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** A register the cashier may open: one open session each (RG-CAI-01/02, H32). */
export const registerStationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Opened by someone else right now. */
  busy: z.boolean(),
});
export type RegisterStation = z.infer<typeof registerStationSchema>;

export const registerSessionOpenSchema = z.object({
  stationId: z.uuid(),
  /** Cash in the drawer at opening (RG-CAI-01). */
  openingFloat: amountString,
});
export type RegisterSessionOpen = z.infer<typeof registerSessionOpenSchema>;

export const registerSessionSchema = z.object({
  id: z.uuid(),
  station: z.object({ id: z.uuid(), name: z.string() }),
  openedAt: z.string(),
  openingFloat: z.string(),
});
export type RegisterSession = z.infer<typeof registerSessionSchema>;

export const paymentLineInputSchema = z.object({
  methodId: z.uuid(),
  amount: positiveAmount,
  /** Transaction reference: required by some methods (RG-PAY-04). */
  reference: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || null)
    .nullable(),
  /** A bill of exchange or a post-dated check (H68): the bank or drawee, and its due day. */
  bank: z
    .string()
    .trim()
    .max(60)
    .transform((value) => value || null)
    .nullable()
    .optional(),
  dueOn: z.iso.date().nullable().optional(),
});
export type PaymentLineInput = z.infer<typeof paymentLineInputSchema>;

/** One settlement of the order at the register (RG-PAY-02/03), in the version the cashier read. */
export const paymentInputSchema = z.object({
  version: z.int().positive(),
  lines: z.array(paymentLineInputSchema).min(1).max(10),
  /** Cash handed over, when part is paid in cash; null: exactly the cash part. */
  cashReceived: amountString.nullable(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const paymentSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  totalDue: z.string(),
  cashReceived: z.string(),
  changeGiven: z.string(),
  createdAt: z.string(),
  lines: z.array(
    z.object({
      method: z.object({ code: z.string(), label: z.string() }),
      amount: z.string(),
      reference: z.string().nullable(),
    }),
  ),
});
export type Payment = z.infer<typeof paymentSchema>;

/** Answers of the API, as the screens check them. */
export const paymentMethodListSchema = z.object({
  methods: z.array(paymentMethodSchema),
  /** Step the cash part is rounded to, in MGA; null: none (RG-FMT-04, ⚠️ HYPOTHÈSE H70). */
  cashRounding: z.int().positive().nullable().default(null),
});
export type PaymentMethodList = z.infer<typeof paymentMethodListSchema>;
export const currentRegisterSessionSchema = z.object({ session: registerSessionSchema.nullable() });
export const registerStationListSchema = z.object({ stations: z.array(registerStationSchema) });
export const paidOrderSchema = z.object({
  order: orderSchema,
  payment: paymentSchema,
  /** Issued with the payment, in the same operation (RG-FAC-01). */
  invoice: invoiceRefSchema,
});
export type PaidOrder = z.infer<typeof paidOrderSchema>;

/** What makes a settlement impossible, first found first. */
export type SettleIssue = 'CASH_TWICE' | 'TOTAL_MISMATCH' | 'CASH_SHORT' | 'CASH_WITHOUT_LINE';

export interface SettleLine {
  amount: string;
  cash: boolean;
}

export interface Settlement {
  /** Amount due, the cash rounding included: what the lines must add up to. */
  due: string;
  /** Rounding of the cash part, + or − (RG-FMT-04); 0.00 without cash or rounding. */
  rounding: string;
  /** Sum of the lines. */
  paid: string;
  /** Amount due − paid: what is still to pay, negative when too much. */
  remaining: string;
  /** Part of the amount due paid in cash. */
  cashPart: string;
  /** Cash handed over (the cash part when not typed). */
  cashReceived: string;
  /** Cash received − cash part (RG-PAY-03). */
  change: string;
  issue: SettleIssue | null;
}

/**
 * A cash part rounded to the shop's step (RG-FMT-04, ⚠️ HYPOTHÈSE H70): to the nearest multiple,
 * half up; never down to zero, kept exact then. `step` null: no rounding.
 */
export function roundCash(amount: string, step: number | null): string {
  const cents = toScaled(amount, 2);
  const unit = BigInt(step ?? 0) * 100n;
  const rounded = unit > 0n && cents > 0n ? ((cents + unit / 2n) / unit) * unit : 0n;
  return fromScaled(rounded > 0n ? rounded : cents, 2);
}

/**
 * A mixed payment checked (RG-PAY-02/03): its lines add up exactly to the amount due; one cash
 * line at most, whose cash handed over covers it, the difference given back as change. Change
 * is only ever given on cash: card or mobile money pay their exact part. With `cashStep`, the
 * cash part — the amount due less the other methods — is rounded (RG-FMT-04, H70).
 */
export function settle(
  totalDue: string,
  lines: readonly SettleLine[],
  cashReceived: string | null,
  cashStep: number | null = null,
): Settlement {
  const cents = (value: string) => toScaled(value, 2);
  const money = (value: bigint) => fromScaled(value, 2);
  const paid = lines.reduce((sum, line) => sum + cents(line.amount), 0n);
  const cashLines = lines.filter((line) => line.cash);
  const cashPart = cashLines.reduce((sum, line) => sum + cents(line.amount), 0n);
  const received = cashReceived === null ? cashPart : cents(cashReceived);
  const exactCash = cents(totalDue) - (paid - cashPart);
  const rounding =
    cashLines.length === 1 ? cents(roundCash(money(exactCash), cashStep)) - exactCash : 0n;
  const due = cents(totalDue) + rounding;
  const remaining = due - paid;

  let issue: SettleIssue | null = null;
  if (cashLines.length > 1) issue = 'CASH_TWICE';
  else if (remaining !== 0n) issue = 'TOTAL_MISMATCH';
  else if (cashLines.length === 0 && received > 0n) issue = 'CASH_WITHOUT_LINE';
  else if (received < cashPart) issue = 'CASH_SHORT';

  return {
    due: money(due),
    rounding: money(rounding),
    paid: money(paid),
    remaining: money(remaining),
    cashPart: money(cashPart),
    cashReceived: money(received),
    change: money(received > cashPart ? received - cashPart : 0n),
    issue,
  };
}
