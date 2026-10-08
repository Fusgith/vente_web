import {
  discountRuleListSchema,
  discountRuleSchema,
  orderSchema,
  suggestedDiscountsSchema,
  type DiscountRuleInput,
  type Order,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopDateValue } from '../src/services/shop-time.js';
import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import { auditActions, createTestApp, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('discount rules (H62)', () => {
  let t: TestApp;
  let s: DiscountScene;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    s = await discountScene(t);
  });

  const today = () => shopDateValue(new Date()).toISOString().slice(0, 10);
  const rule = (input: Partial<DiscountRuleInput> = {}): DiscountRuleInput => ({
    kind: 'QUANTITY',
    productId: s.products.soap,
    categoryId: null,
    minQty: '24',
    customerCategory: null,
    pct: '10',
    startsOn: null,
    endsOn: null,
    isActive: true,
    ...input,
  });
  const created = async (input: DiscountRuleInput) => {
    const reply = await s.post('/discount-rules', s.cookies.owner, input);
    expect(reply.statusCode, reply.body).toBe(201);
    return discountRuleSchema.parse(reply.json());
  };
  const get = (url: string, cookie: string) => request(t.app, 'GET', `/api/v1${url}`, { cookie });

  it('the owner sets them, audited before → after; the others read them', async () => {
    const soap = await created(rule());
    expect(soap).toMatchObject({
      kind: 'QUANTITY',
      product: { id: s.products.soap, sku: 'SAV-001' },
      category: null,
      minQty: '24',
      pct: '10',
      isActive: true,
    });
    const changed = await request(t.app, 'PUT', `/api/v1/discount-rules/${soap.id}`, {
      cookie: s.cookies.owner,
      body: rule({ pct: '8', isActive: false }),
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(await auditActions(t.db, soap.id)).toEqual([
      'discount_rule.created',
      'discount_rule.updated',
    ]);
    const audit = await t.db.auditLog.findFirstOrThrow({
      where: { entityId: soap.id, action: 'discount_rule.updated' },
    });
    expect(audit.before).toMatchObject({ pct: '10', isActive: true });
    expect(audit.after).toMatchObject({ pct: '8', isActive: false });

    const list = await get('/discount-rules', s.cookies.cashier);
    expect(list.statusCode).toBe(200);
    expect(discountRuleListSchema.parse(list.json()).items).toMatchObject([
      { id: soap.id, pct: '8' },
    ]);
    expect((await s.post('/discount-rules', s.cookies.manager, rule())).statusCode).toBe(403);
  });

  it('refuses a rule without its condition, an unknown category or product', async () => {
    const refused = async (input: DiscountRuleInput, status: number, code?: string) => {
      const reply = await s.post('/discount-rules', s.cookies.owner, input);
      expect(reply.statusCode, reply.body).toBe(status);
      if (code) expect(reply.json()).toMatchObject({ code });
    };
    await refused(rule({ minQty: null }), 400);
    await refused(rule({ kind: 'PROMOTION', minQty: null }), 400);
    await refused(rule({ pct: '0' }), 400);
    await refused(
      rule({ kind: 'CUSTOMER_CATEGORY', minQty: null, customerCategory: 'Inconnue' }),
      400,
      'CUSTOMER_CATEGORY_UNKNOWN',
    );
    await refused(rule({ productId: s.ids.customer }), 404);
    expect(await t.db.discountRule.count()).toBe(0);
  });

  describe('at the register', () => {
    let order: Order;

    beforeEach(async () => {
      // Soap: 10 % from 24 pieces (4 packs of 6). Everything: 8 % today, a promotion.
      await created(rule());
      await created(
        rule({
          kind: 'PROMOTION',
          productId: null,
          minQty: null,
          pct: '8',
          startsOn: today(),
          endsOn: today(),
        }),
      );
      // Switched off or over: never suggested.
      await created(rule({ productId: null, minQty: '1', pct: '50', isActive: false }));
      order = await s.atRegister();
    });

    const discount = (lines: [number, string | null][]) =>
      s.post(`/orders/${order.id}/discounts`, s.cookies.cashier, {
        version: order.version,
        lines: lines.map(([position, pct]) => ({
          position,
          discount: pct === null ? null : { kind: 'pct', value: pct },
        })),
      });

    it('suggests the best rule of each line, never a sum', async () => {
      const reply = await get(`/orders/${order.id}/suggested-discounts`, s.cookies.cashier);
      expect(reply.statusCode, reply.body).toBe(200);
      expect(suggestedDiscountsSchema.parse(reply.json())).toEqual({
        version: order.version,
        lines: [
          { position: 1, pct: '10' },
          { position: 2, pct: '8' },
        ],
      });
    });

    it('applies a suggested discount beyond the cap, as the rule’s; not beyond it', async () => {
      const beyond = await discount([[1, '10.5']]);
      expect(beyond.statusCode).toBe(422);
      expect(beyond.json()).toMatchObject({ details: { lines: [1] } });

      const reply = await discount([
        [1, '10'],
        [2, '8'],
      ]);
      expect(reply.statusCode, reply.body).toBe(200);
      const after = orderSchema.parse(reply.json());
      expect(after.lines).toMatchObject([
        { discountAmount: '10000.00', discountSource: 'RULE' },
        { discountAmount: '1560.00', discountSource: 'RULE' },
      ]);
      // Beyond the promotion, the nails' cap of 15 % still holds: within the cap.
      order = after;
      const capped = orderSchema.parse((await discount([[2, '12']])).json());
      expect(capped.lines[1]).toMatchObject({ discountSource: 'WITHIN_CAP' });
    });

    it('a lowered quantity that loses its rule brings the discount down to the cap', async () => {
      order = orderSchema.parse((await discount([[1, '10']])).json());
      const reply = await s.post(`/orders/${order.id}/adjust`, s.cookies.cashier, {
        version: order.version,
        changes: [{ position: 1, qty: '3' }],
      });
      expect(reply.statusCode, reply.body).toBe(200);
      // 3 packs: 18 pieces, under 24; the promotion's 8 % beyond the 5 % cap remains.
      expect(orderSchema.parse(reply.json()).lines[0]).toMatchObject({
        qty: '3',
        discountPct: '8.00',
        discountAmount: '6000.00',
        discountSource: 'RULE',
      });
    });
  });
});
