import { describe, expect, it } from 'vitest';

import {
  discountRuleInputSchema,
  suggestedDiscounts,
  type DiscountRule,
  type DiscountRuleInput,
} from './discount-rules.js';

const SOAP = '11111111-1111-4111-8111-111111111111';
const RICE = '22222222-2222-4222-8222-222222222222';
const FOOD = '33333333-3333-4333-8333-333333333333';

let next = 0;
function rule(overrides: Partial<DiscountRule> = {}): DiscountRule {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
    kind: 'PROMOTION',
    product: null,
    category: null,
    minQty: null,
    customerCategory: null,
    pct: '5',
    startsOn: '2026-10-01',
    endsOn: '2026-10-31',
    isActive: true,
    updatedAt: '2026-10-01T08:00:00.000+03:00',
    ...overrides,
  };
}

const soap = { productId: SOAP, categoryId: null, qty: '2', factor: '6' };
const rice = { productId: RICE, categoryId: FOOD, qty: '1', factor: '1' };
const context = { customerCategory: 'Régulier', day: '2026-10-09' };

describe('suggestedDiscounts (H62)', () => {
  it('takes the best rule in force of each line, never a sum', () => {
    const rules = [
      rule({ pct: '5' }),
      rule({
        kind: 'CUSTOMER_CATEGORY',
        customerCategory: 'Régulier',
        pct: '7',
        startsOn: null,
        endsOn: null,
      }),
      rule({ category: { id: FOOD, name: 'Alimentation' }, pct: '9' }),
    ];
    expect(suggestedDiscounts(rules, [soap, rice], context)).toEqual(['7', '9']);
  });

  it('counts a quantity in base units over every line of the product', () => {
    const rules = [
      rule({
        kind: 'QUANTITY',
        product: { id: SOAP, sku: 'SAV-001', name: 'Savon' },
        minQty: '18',
        pct: '10',
        startsOn: null,
        endsOn: null,
      }),
    ];
    // 2 packs of 6: 12 pieces, under 18; with 6 pieces more, 18.
    expect(suggestedDiscounts(rules, [soap], context)).toEqual([null]);
    const pieces = { ...soap, qty: '6', factor: '1' };
    expect(suggestedDiscounts(rules, [soap, pieces, rice], context)).toEqual(['10', '10', null]);
  });

  it('leaves out a rule switched off, not started or over, or for another customer', () => {
    const rules = [
      rule({ isActive: false, pct: '20' }),
      rule({ startsOn: '2026-10-10', pct: '20' }),
      rule({ endsOn: '2026-10-08', pct: '20' }),
      rule({
        kind: 'CUSTOMER_CATEGORY',
        customerCategory: 'Divers',
        pct: '20',
        startsOn: null,
        endsOn: null,
      }),
    ];
    expect(suggestedDiscounts(rules, [soap], context)).toEqual([null]);
  });
});

describe('discountRuleInputSchema (H62)', () => {
  const input = (overrides: Partial<DiscountRuleInput> = {}): DiscountRuleInput => ({
    kind: 'QUANTITY',
    productId: SOAP,
    categoryId: null,
    minQty: '12',
    customerCategory: null,
    pct: '10',
    startsOn: null,
    endsOn: null,
    isActive: true,
    ...overrides,
  });
  const ok = (overrides: Partial<DiscountRuleInput>) =>
    discountRuleInputSchema.safeParse(input(overrides)).success;

  it('asks each kind its condition and nothing else', () => {
    expect(ok({})).toBe(true);
    expect(ok({ minQty: null })).toBe(false);
    expect(ok({ kind: 'CUSTOMER_CATEGORY', minQty: null, customerCategory: 'Divers' })).toBe(true);
    expect(ok({ kind: 'CUSTOMER_CATEGORY', customerCategory: 'Divers' })).toBe(false);
    expect(ok({ kind: 'PROMOTION', minQty: null, startsOn: '2026-10-01' })).toBe(false);
    expect(
      ok({ kind: 'PROMOTION', minQty: null, startsOn: '2026-10-01', endsOn: '2026-10-31' }),
    ).toBe(true);
  });

  it('refuses two scopes, a rate out of (0, 100] or an end before the start', () => {
    expect(ok({ categoryId: FOOD })).toBe(false);
    expect(ok({ pct: '0' })).toBe(false);
    expect(ok({ pct: '100.01' })).toBe(false);
    expect(ok({ pct: '100' })).toBe(true);
    expect(ok({ startsOn: '2026-10-02', endsOn: '2026-10-01' })).toBe(false);
  });
});
