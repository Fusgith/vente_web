import {
  suggestedDiscounts,
  type DiscountRule,
  type discountRuleInputSchema,
} from '@vente-web/shared';
import type { z } from 'zod';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { customerCategories } from './customers.js';
import { shopDateValue } from './shop-time.js';

type RuleInput = z.output<typeof discountRuleInputSchema>;

const select = {
  id: true,
  kind: true,
  minQty: true,
  customerCategory: true,
  pct: true,
  startsOn: true,
  endsOn: true,
  isActive: true,
  updatedAt: true,
  product: { select: { id: true, sku: true, name: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.DiscountRuleSelect;
type StoredRule = Prisma.DiscountRuleGetPayload<{ select: typeof select }>;

/** A `date` column holds midnight UTC of the shop's day: `YYYY-MM-DD`. */
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

function toView(row: StoredRule): DiscountRule {
  return {
    ...row,
    minQty: row.minQty?.toFixed() ?? null,
    pct: row.pct.toFixed(),
    startsOn: day(row.startsOn),
    endsOn: day(row.endsOn),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** What the audit keeps of a rule: its input as the owner typed it. */
const audited = (rule: DiscountRule) => ({
  kind: rule.kind,
  productId: rule.product?.id ?? null,
  categoryId: rule.category?.id ?? null,
  minQty: rule.minQty,
  customerCategory: rule.customerCategory,
  pct: rule.pct,
  startsOn: rule.startsOn,
  endsOn: rule.endsOn,
  isActive: rule.isActive,
});

/** Every rule, the active ones first, the latest first (H62). */
export async function listDiscountRules(db: Db): Promise<DiscountRule[]> {
  const rows = await db.discountRule.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    select,
  });
  return rows.map(toView);
}

/** The rules in force on the shop's day of `now`, as the register applies them (H61, H62). */
export async function rulesInForce(db: AuditTx, now = new Date()): Promise<DiscountRule[]> {
  const today = shopDateValue(now);
  const rows = await db.discountRule.findMany({
    where: {
      isActive: true,
      OR: [{ startsOn: null }, { startsOn: { lte: today } }],
      AND: [{ OR: [{ endsOn: null }, { endsOn: { gte: today } }] }],
    },
    select,
  });
  return rows.map(toView);
}

/** A line as the rules read it: its product and its quantity in the sale unit (RG-ART-06). */
export interface SuggestedLine {
  productId: string;
  qty: string;
  factor: string;
}

/**
 * The suggested discount of each line of a customer's order, in the order of the lines (H62): the
 * best rule in force today for the line's product, its category and the customer's category.
 */
export async function suggestedFor(
  db: AuditTx,
  customerId: string,
  lines: readonly SuggestedLine[],
  now = new Date(),
): Promise<(string | null)[]> {
  const rules = await rulesInForce(db, now);
  if (rules.length === 0) return lines.map(() => null);
  // One query after the other: `db` may be a transaction.
  const customer = await db.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { category: true },
  });
  const products = await db.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) } },
    select: { id: true, categoryId: true },
  });
  const categories = new Map(products.map((product) => [product.id, product.categoryId]));
  return suggestedDiscounts(
    rules,
    lines.map((line) => ({ ...line, categoryId: categories.get(line.productId) ?? null })),
    { customerCategory: customer.category, day: shopDateValue(now).toISOString().slice(0, 10) },
  );
}

/** The suggested discounts of an order's lines as they stand (H62). */
export function suggestedOn(
  db: AuditTx,
  order: {
    customerId: string;
    lines: readonly {
      productId: string;
      qty: { toFixed(): string };
      factor: { toFixed(): string };
    }[];
  },
  now = new Date(),
): Promise<(string | null)[]> {
  const lines = order.lines.map((line) => ({
    productId: line.productId,
    qty: line.qty.toFixed(),
    factor: line.factor.toFixed(),
  }));
  return suggestedFor(db, order.customerId, lines, now);
}

/** Its product or category exists, its customer category is one of the shop's (H49 a). */
async function checked(db: Db, input: RuleInput) {
  if (input.productId && !(await db.product.count({ where: { id: input.productId } }))) {
    throw new AppError(404, 'NOT_FOUND');
  }
  if (input.categoryId && !(await db.category.count({ where: { id: input.categoryId } }))) {
    throw new AppError(404, 'NOT_FOUND');
  }
  if (
    input.customerCategory !== null &&
    !(await customerCategories(db)).includes(input.customerCategory)
  ) {
    throw new AppError(400, 'CUSTOMER_CATEGORY_UNKNOWN');
  }
  return {
    kind: input.kind,
    productId: input.productId,
    categoryId: input.categoryId,
    minQty: input.minQty,
    customerCategory: input.customerCategory,
    pct: input.pct,
    // `YYYY-MM-DD` reads as midnight UTC, as the `date` column holds it.
    startsOn: input.startsOn ? new Date(input.startsOn) : null,
    endsOn: input.endsOn ? new Date(input.endsOn) : null,
    isActive: input.isActive,
  };
}

/** The owner sets a rule (H62), audited (RG-AUD-01). */
export async function createDiscountRule(
  db: Db,
  actor: Actor,
  input: RuleInput,
): Promise<DiscountRule> {
  const data = await checked(db, input);
  return db.$transaction(async (tx) => {
    const created = toView(
      await tx.discountRule.create({ data: { ...data, createdById: actor.userId }, select }),
    );
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_rule.created',
      entityType: 'discount_rule',
      entityId: created.id,
      after: audited(created),
    });
    return created;
  });
}

/**
 * The owner changes a rule or switches it off (H62): orders already discounted keep their
 * discounts; only the next ones see the change. Audited before → after (RG-AUD-01).
 */
export async function updateDiscountRule(
  db: Db,
  actor: Actor,
  id: string,
  input: RuleInput,
): Promise<DiscountRule> {
  const data = await checked(db, input);
  return db.$transaction(async (tx) => {
    const current = await tx.discountRule.findUnique({ where: { id }, select });
    if (!current) throw new AppError(404, 'NOT_FOUND');
    const updated = toView(await tx.discountRule.update({ where: { id }, data, select }));
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_rule.updated',
      entityType: 'discount_rule',
      entityId: id,
      before: audited(toView(current)),
      after: audited(updated),
    });
    return updated;
  });
}
