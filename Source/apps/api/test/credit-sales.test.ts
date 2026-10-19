import { randomUUID } from 'node:crypto';

import {
  creditConditionSchema,
  receivableListSchema,
  receivablePaymentSchema,
  type CreditConditionInput,
  type Order,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopDateValue } from '../src/services/shop-time.js';
import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import { auditActions, createStation, createTestApp, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('credit sale (T-095, H67)', () => {
  let t: TestApp;
  let s: DiscountScene;
  let order: Order;
  let methods: Record<string, string>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    s = await discountScene(t);
    methods = Object.fromEntries(
      (await t.db.paymentMethod.findMany()).map((method) => [method.code, method.id]),
    );
    const stationId = (await createStation(t.db, 'REGISTER')).id;
    await s.post('/register-sessions', s.cookies.cashier, { stationId, openingFloat: '0' });
    // 4 packs of soap and 3 kg of nails: 119 500.
    order = await s.atRegister();
  });

  const condition = async (input: Partial<CreditConditionInput> = {}) => {
    const reply = await s.post('/credit-conditions', s.cookies.owner, {
      customerType: 'INDIVIDUAL',
      customerCategory: null,
      customerId: null,
      ceiling: '100000',
      days: 30,
      isActive: true,
      ...input,
    });
    expect(reply.statusCode, reply.body).toBe(201);
    return creditConditionSchema.parse(reply.json());
  };
  const payOnCredit = (credit: string, cash = '0') =>
    s.post(
      `/orders/${order.id}/pay`,
      s.cookies.cashier,
      {
        version: order.version,
        lines: [
          ...(cash === '0' ? [] : [{ methodId: methods['CASH'], amount: cash, reference: null }]),
          { methodId: methods['CREDIT'], amount: credit, reference: null },
        ],
        cashReceived: cash === '0' ? null : cash,
      },
      randomUUID(),
    );
  const receivables = async () => {
    const reply = await request(t.app, 'GET', '/api/v1/receivables', {
      cookie: s.cookies.cashier,
    });
    expect(reply.statusCode, reply.body).toBe(200);
    return receivableListSchema.parse(reply.json());
  };
  const settle = (id: string, method: string, amount: string) =>
    s.post(`/receivables/${id}/settlements`, s.cookies.cashier, {
      methodId: methods[method],
      amount,
      reference: null,
    });

  it('refuses credit without a condition, beyond the ceiling or with a debt overdue', async () => {
    const none = await payOnCredit('119500');
    expect(none.statusCode, none.body).toBe(422);
    expect(none.json()).toMatchObject({
      code: 'CREDIT_NOT_ALLOWED',
      details: { reason: 'NO_CONDITION' },
    });

    await condition();
    const beyond = await payOnCredit('119500');
    expect(beyond.json()).toMatchObject({ details: { reason: 'CEILING', ceiling: '100000.00' } });
    expect(await t.db.invoice.count()).toBe(0);

    // The customer's own condition wins over their type's (⚠️ H72).
    await condition({ customerType: null, customerId: s.ids.customer, ceiling: '200000' });
    expect((await payOnCredit('119500')).statusCode).toBe(200);
    await t.db.receivable.updateMany({ data: { dueOn: new Date('2026-01-01') } });

    order = await s.atRegister();
    const overdue = await payOnCredit('119500');
    expect(overdue.json()).toMatchObject({ details: { reason: 'OVERDUE' } });
  });

  it('leaves a receivable, printed on the invoice, settled at the register with a receipt', async () => {
    await condition();
    const paid = await payOnCredit('69500', '50000');
    expect(paid.statusCode, paid.body).toBe(200);
    const invoice = await t.db.invoice.findFirstOrThrow();
    expect(invoice.snapshot).toMatchObject({ credit: { amount: '69500.00' } });

    const list = await receivables();
    expect(list.totals).toEqual({ remaining: '69500.00', overdue: '0.00' });
    const [receivable] = list.items;
    if (!receivable) throw new Error('no receivable');
    const due = new Date(shopDateValue(new Date()).getTime() + 30 * 86_400_000);
    expect(receivable).toMatchObject({
      invoice: { number: invoice.number },
      amount: '69500.00',
      remaining: '69500.00',
      dueOn: due.toISOString().slice(0, 10),
      overdue: false,
      status: 'OPEN',
    });

    expect((await settle(receivable.id, 'CASH', '70000')).json()).toMatchObject({
      code: 'SETTLEMENT_TOO_HIGH',
    });
    expect((await settle(receivable.id, 'CREDIT', '1000')).statusCode).toBe(409);

    const first = receivablePaymentSchema.parse(
      (await settle(receivable.id, 'CASH', '20000')).json(),
    );
    expect(first.number).toMatch(/^RC-\d{4}-000001$/);
    expect(first.receivable).toMatchObject({ paid: '20000.00', status: 'OPEN' });
    const last = await settle(receivable.id, 'CASH', '49500');
    expect(last.statusCode, last.body).toBe(201);
    expect(receivablePaymentSchema.parse(last.json()).receivable.status).toBe('SETTLED');
    expect((await settle(receivable.id, 'CASH', '1')).json()).toMatchObject({
      code: 'RECEIVABLE_SETTLED',
    });
    expect((await receivables()).items).toEqual([]);
    expect(await auditActions(t.db, receivable.id)).toEqual([
      'receivable.settled',
      'receivable.settled',
    ]);

    const pdf = await request(t.app, 'GET', `/api/v1/receivable-settlements/${first.id}/pdf`, {
      cookie: s.cookies.cashier,
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    // At the closing, credit is a method of its own; the settlements count in cash.
    const summary = await request(t.app, 'GET', '/api/v1/register-sessions/current/summary', {
      cookie: s.cookies.cashier,
    });
    expect(summary.json()).toMatchObject({
      summary: {
        byMethod: [
          { code: 'CASH', count: 3, total: '119500.00' },
          { code: 'CREDIT', count: 1, total: '69500.00' },
        ],
        cashExpected: '119500.00',
      },
    });
  });
});
