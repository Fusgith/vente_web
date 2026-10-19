import type { CreditCondition, creditConditionInputSchema } from '@vente-web/shared';
import type { z } from 'zod';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { customerCategories } from './customers.js';
import { shopDateValue } from './shop-time.js';

type ConditionInput = z.output<typeof creditConditionInputSchema>;

const select = {
  id: true,
  customerType: true,
  customerCategory: true,
  ceiling: true,
  days: true,
  isActive: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.CreditConditionSelect;
type StoredCondition = Prisma.CreditConditionGetPayload<{ select: typeof select }>;

function toView(row: StoredCondition): CreditCondition {
  return { ...row, ceiling: row.ceiling.toFixed(2), updatedAt: row.updatedAt.toISOString() };
}

/** What the audit keeps of a condition: its input as the owner typed it. */
const audited = (condition: CreditCondition) => ({
  customerType: condition.customerType,
  customerCategory: condition.customerCategory,
  customerId: condition.customer?.id ?? null,
  ceiling: condition.ceiling,
  days: condition.days,
  isActive: condition.isActive,
});

/** Every condition, the active ones first (H67). */
export async function listCreditConditions(db: Db): Promise<CreditCondition[]> {
  const rows = await db.creditCondition.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    select,
  });
  return rows.map(toView);
}

/** Its customer exists, its category is one of the shop's (H49 a). */
async function checked(db: Db, input: ConditionInput) {
  if (input.customerId && !(await db.customer.count({ where: { id: input.customerId } }))) {
    throw new AppError(404, 'NOT_FOUND');
  }
  if (
    input.customerCategory !== null &&
    !(await customerCategories(db)).includes(input.customerCategory)
  ) {
    throw new AppError(400, 'CUSTOMER_CATEGORY_UNKNOWN');
  }
  return input;
}

/** One condition per type, category or customer: a second one is refused. */
function taken(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError(409, 'CREDIT_CONDITION_EXISTS');
  }
  throw error;
}

/** The owner sets a condition (H67), audited (RG-AUD-01). */
export async function createCreditCondition(
  db: Db,
  actor: Actor,
  input: ConditionInput,
): Promise<CreditCondition> {
  const data = await checked(db, input);
  return db
    .$transaction(async (tx) => {
      const created = toView(await tx.creditCondition.create({ data, select }));
      await recordAudit(tx, {
        ...by(actor),
        action: 'credit_condition.created',
        entityType: 'credit_condition',
        entityId: created.id,
        after: audited(created),
      });
      return created;
    })
    .catch(taken);
}

/** The owner changes a condition or switches it off (H67): sales already made keep their terms. */
export async function updateCreditCondition(
  db: Db,
  actor: Actor,
  id: string,
  input: ConditionInput,
): Promise<CreditCondition> {
  const data = await checked(db, input);
  return db
    .$transaction(async (tx) => {
      const current = await tx.creditCondition.findUnique({ where: { id }, select });
      if (!current) throw new AppError(404, 'NOT_FOUND');
      const updated = toView(await tx.creditCondition.update({ where: { id }, data, select }));
      await recordAudit(tx, {
        ...by(actor),
        action: 'credit_condition.updated',
        entityType: 'credit_condition',
        entityId: id,
        before: audited(toView(current)),
        after: audited(updated),
      });
      return updated;
    })
    .catch(taken);
}

/**
 * The day a credit of `amount` falls due for the customer, or a refusal (H67, RG-PAY-02): the
 * customer's own active condition, else their category's, else their type's (⚠️ H72); no due
 * day already passed, a title still to cash aside (H68); their outstanding, this credit included, within its ceiling.
 */
export async function creditDueOn(
  tx: Prisma.TransactionClient,
  customerId: string,
  amount: string,
  now: Date,
): Promise<Date> {
  // The customer locked: two credit sales at once never pass the ceiling together.
  await tx.$queryRaw`SELECT 1 FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE`;
  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { category: true, type: true },
  });
  const conditions = await tx.creditCondition.findMany({
    where: {
      isActive: true,
      OR: [
        { customerId },
        { customerCategory: customer.category },
        { customerType: customer.type },
      ],
    },
  });
  const condition =
    conditions.find((c) => c.customerId) ??
    conditions.find((c) => c.customerCategory) ??
    conditions.find((c) => c.customerType);
  const refuse = (reason: string, details: object = {}): never => {
    throw new AppError(422, 'CREDIT_NOT_ALLOWED', { reason, ...details });
  };
  if (!condition) return refuse('NO_CONDITION');

  const today = shopDateValue(now);
  const [open] = await tx.$queryRaw<{ outstanding: string; overdue: boolean }[]>`
    SELECT COALESCE(SUM("amount" - "paid"), 0)::text AS "outstanding",
           COALESCE(BOOL_OR("due_on" < ${today}::date
                            AND "instrument_status" IS DISTINCT FROM 'HANDED'), false) AS "overdue"
      FROM "receivables" WHERE "customer_id" = ${customerId}::uuid AND "status" = 'OPEN'`;
  const outstanding = open?.outstanding ?? '0';
  const details = { ceiling: condition.ceiling.toFixed(2), outstanding };
  if (open?.overdue) refuse('OVERDUE', details);
  if (new Prisma.Decimal(outstanding).plus(amount).gt(condition.ceiling)) {
    refuse('CEILING', details);
  }
  return new Date(today.getTime() + condition.days * 86_400_000);
}
