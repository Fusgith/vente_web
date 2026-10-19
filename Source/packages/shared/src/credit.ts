/**
 * Credit sale (⚠️ H67): the owner's credit conditions, the receivables a credit sale leaves and
 * their settlements at the register.
 */
import { z } from 'zod';

import { customerTypeSchema } from './customers.js';
import { toScaled } from './decimal.js';
import { paymentLineInputSchema } from './payments.js';

/** Code of the credit part in the list of payment methods (RG-PAY-02, H67). */
export const CREDIT_METHOD = 'CREDIT';

/** Codes of the titles paid at their due day, granted like a credit (⚠️ H68). */
export const INSTRUMENT_METHODS: readonly string[] = ['BILL_OF_EXCHANGE', 'POSTDATED_CHECK'];

/** Paid later: credit or a title. Never a refund nor a receivable's settlement (H67, H68). */
export const isTermMethod = (code: string) =>
  code === CREDIT_METHOD || INSTRUMENT_METHODS.includes(code);

/**
 * Credit allowed without the owner, for one customer type, one customer category or one customer
 * (H67): an outstanding ceiling, the sale included, and the days to settle.
 */
export const creditConditionInputSchema = z
  .object({
    customerType: customerTypeSchema.nullable(),
    customerCategory: z.string().trim().min(1).max(40).nullable(),
    customerId: z.uuid().nullable(),
    ceiling: z
      .string()
      .regex(/^\d{1,12}(?:\.\d{1,2})?$/)
      .refine((value) => toScaled(value, 2) > 0n, 'ceiling'),
    days: z.number().int().min(1).max(365),
    isActive: z.boolean(),
  })
  .refine(
    (input) =>
      [input.customerType, input.customerCategory, input.customerId].filter((v) => v !== null)
        .length === 1,
    { path: ['customerType'], message: 'one_scope' },
  );
export type CreditConditionInput = z.input<typeof creditConditionInputSchema>;

const customerRefSchema = z.object({ id: z.uuid(), name: z.string(), phone: z.string() });

export const creditConditionSchema = z.object({
  id: z.uuid(),
  customerType: customerTypeSchema.nullable(),
  customerCategory: z.string().nullable(),
  customer: customerRefSchema.nullable(),
  ceiling: z.string(),
  days: z.number().int(),
  isActive: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CreditCondition = z.infer<typeof creditConditionSchema>;

export const creditConditionListSchema = z.object({ items: z.array(creditConditionSchema) });

/** What a credit sale leaves to pay (H67). */
export const receivableSchema = z.object({
  id: z.uuid(),
  invoice: z.object({ id: z.uuid(), number: z.string() }),
  customer: customerRefSchema,
  amount: z.string(),
  paid: z.string(),
  remaining: z.string(),
  /** Shop day, YYYY-MM-DD. */
  dueOn: z.iso.date(),
  overdue: z.boolean(),
  status: z.enum(['OPEN', 'SETTLED']),
  /** The title covering it until its due day (H68): handed, then cashed or unpaid. */
  instrument: z
    .object({
      method: z.string(),
      number: z.string(),
      bank: z.string(),
      status: z.enum(['HANDED', 'CASHED', 'UNPAID']),
    })
    .nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Receivable = z.infer<typeof receivableSchema>;

export const receivableListSchema = z.object({
  items: z.array(receivableSchema),
  /** Left to pay over the listed receivables, and of it what is overdue. */
  totals: z.object({ remaining: z.string(), overdue: z.string() }),
});
export type ReceivableList = z.infer<typeof receivableListSchema>;

/** A payment towards a receivable: one method, its amount, its reference if required. */
export const receivablePaymentInputSchema = paymentLineInputSchema;
export type ReceivablePaymentInput = z.infer<typeof receivablePaymentInputSchema>;

export const receivablePaymentSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  amount: z.string(),
  receivable: receivableSchema,
});
export type ReceivablePayment = z.infer<typeof receivablePaymentSchema>;

/** At its due day, the manager marks the title cashed or unpaid (H68). */
export const instrumentOutcomeSchema = z.object({ outcome: z.enum(['CASHED', 'UNPAID']) });
export type InstrumentOutcome = z.infer<typeof instrumentOutcomeSchema>['outcome'];
