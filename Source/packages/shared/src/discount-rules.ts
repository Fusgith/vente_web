/**
 * The owner's discount rules (⚠️ H62): a rate the shop plans, by quantity, by customer category
 * or over a promotion period, on every product, a category of products or one product. A rule
 * never applies by itself: the best one of a line is its suggested discount, which the cashier
 * applies at the customer's request and which widens the line's limit (H61, RG-REM-02).
 */
import { z } from 'zod';

import { customerTypeSchema, type CustomerType } from './customers.js';
import { baseQuantity, isQuantity, toScaled } from './decimal.js';

export const DISCOUNT_RULE_KINDS = [
  'QUANTITY',
  'CUSTOMER_CATEGORY',
  'CUSTOMER_TYPE',
  'PROMOTION',
] as const;
export type DiscountRuleKind = (typeof DISCOUNT_RULE_KINDS)[number];

/** More than 0 %, 100 % at most, 2 decimals (H62). */
const rateSchema = z
  .string()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/)
  .refine((value) => toScaled(value, 2) > 0n && toScaled(value, 2) <= 10_000n, 'rate');

/**
 * A rule as the owner sets it (H62). Its kind says which condition it carries: a quantity in base
 * units for QUANTITY, a customer category for CUSTOMER_CATEGORY, both dates for PROMOTION. Its
 * scope is a product, a category of products, or neither: every product.
 */
export const discountRuleInputSchema = z
  .object({
    kind: z.enum(DISCOUNT_RULE_KINDS),
    productId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    /** From this many base units of one product in the order (QUANTITY). */
    minQty: z.string().refine(isQuantity, 'quantity').nullable(),
    /** One of the shop's customer categories (CUSTOMER_CATEGORY, H49 a). */
    customerCategory: z.string().trim().min(1).max(40).nullable(),
    /** One of the customer types (CUSTOMER_TYPE, H66). */
    customerType: customerTypeSchema.nullable().default(null),
    pct: rateSchema,
    /** Shop days, both included; mandatory for a promotion, optional otherwise. */
    startsOn: z.iso.date().nullable(),
    endsOn: z.iso.date().nullable(),
    isActive: z.boolean(),
  })
  .superRefine((rule, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    if (rule.productId && rule.categoryId) issue('categoryId', 'one_scope');
    if ((rule.kind === 'QUANTITY') !== (rule.minQty !== null)) issue('minQty', 'quantity_kind');
    if ((rule.kind === 'CUSTOMER_CATEGORY') !== (rule.customerCategory !== null)) {
      issue('customerCategory', 'category_kind');
    }
    if ((rule.kind === 'CUSTOMER_TYPE') !== (rule.customerType !== null)) {
      issue('customerType', 'type_kind');
    }
    if (rule.kind === 'PROMOTION' && (!rule.startsOn || !rule.endsOn)) issue('endsOn', 'dates');
    if (rule.startsOn && rule.endsOn && rule.endsOn < rule.startsOn) issue('endsOn', 'order');
  });
export type DiscountRuleInput = z.input<typeof discountRuleInputSchema>;

export const discountRuleSchema = z.object({
  id: z.uuid(),
  kind: z.enum(DISCOUNT_RULE_KINDS),
  product: z.object({ id: z.uuid(), sku: z.string(), name: z.string() }).nullable(),
  category: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  minQty: z.string().nullable(),
  customerCategory: z.string().nullable(),
  customerType: customerTypeSchema.nullable(),
  pct: z.string(),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  isActive: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type DiscountRule = z.infer<typeof discountRuleSchema>;

export const discountRuleListSchema = z.object({ items: z.array(discountRuleSchema) });
export type DiscountRuleList = z.infer<typeof discountRuleListSchema>;

/** The suggested discount of each line of an order, by position from 1, for its version (H62). */
export const suggestedDiscountsSchema = z.object({
  version: z.int().positive(),
  lines: z.array(z.object({ position: z.int().positive(), pct: z.string().nullable() })),
});
export type SuggestedDiscounts = z.infer<typeof suggestedDiscountsSchema>;

/** A line of an order as the rules see it: its product, the product's category, its quantity. */
export interface RuleLine {
  productId: string;
  categoryId: string | null;
  /** In the sale unit, with its factor to the base unit (RG-ART-06). */
  qty: string;
  factor: string;
}

export interface RuleContext {
  /** The order's customer category (H49 a). */
  customerCategory: string;
  /** The order's customer type (H66). */
  customerType: CustomerType;
  /** The shop's day, `YYYY-MM-DD`. */
  day: string;
}

/** In force on `day`: active, started, not ended. */
export function ruleInForce(rule: DiscountRule, day: string): boolean {
  return (
    rule.isActive &&
    (!rule.startsOn || rule.startsOn <= day) &&
    (!rule.endsOn || day <= rule.endsOn)
  );
}

/**
 * The suggested discount of each line (H62): the rate of the best rule in force that concerns it,
 * never a sum of rules; null when none does. A quantity counts every line of the same product,
 * whatever its sale unit, in base units.
 */
export function suggestedDiscounts(
  rules: readonly DiscountRule[],
  lines: readonly RuleLine[],
  context: RuleContext,
): (string | null)[] {
  const quantities = new Map<string, bigint>();
  for (const line of lines) {
    const base = toScaled(baseQuantity(line.qty, line.factor), 2);
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0n) + base);
  }
  const inForce = rules.filter((rule) => ruleInForce(rule, context.day));
  return lines.map((line) => {
    let best: bigint | null = null;
    let bestPct: string | null = null;
    for (const rule of inForce) {
      const scoped = rule.product
        ? rule.product.id === line.productId
        : !rule.category || rule.category.id === line.categoryId;
      const met =
        rule.kind === 'QUANTITY'
          ? toScaled(rule.minQty ?? '0', 2) <= (quantities.get(line.productId) ?? 0n)
          : rule.kind === 'CUSTOMER_CATEGORY'
            ? rule.customerCategory === context.customerCategory
            : rule.kind === 'CUSTOMER_TYPE'
              ? rule.customerType === context.customerType
              : true;
      const rate = toScaled(rule.pct, 2);
      if (scoped && met && (best === null || rate > best)) {
        best = rate;
        bestPct = rule.pct;
      }
    }
    return bestPct;
  });
}
