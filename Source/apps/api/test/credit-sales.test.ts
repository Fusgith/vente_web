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
  it('holds a bill or a post-dated check as paid until the manager marks it (T-096, ⚠️ H73)', async () => {
    await condition();
    const later = new Date(shopDateValue(new Date()).getTime() + 60 * 86_400_000);
    const due = later.toISOString().slice(0, 10);
    const pay = (lines: object[]) =>
      s.post(
        `/orders/${order.id}/pay`,
        s.cookies.cashier,
        {
          version: order.version,
          lines: [{ methodId: methods['CASH'], amount: '50000', reference: null }, ...lines],
          cashReceived: '50000',
        },
        randomUUID(),
      );
    const check = (code: string, amount = '69500') => ({
      methodId: methods[code],
      amount,
      reference: '1234567',
      bank: 'BOA',
      dueOn: due,
    });
    const mark = (id: string, outcome: string, cookie = s.cookies.manager) =>
      s.post(`/receivables/${id}/instrument`, cookie, { outcome });

    expect((await pay([{ ...check('POSTDATED_CHECK'), bank: null }])).json()).toMatchObject({
      code: 'PAYMENT_INSTRUMENT_DETAILS',
    });
    expect(
      (
        await pay([
          { methodId: methods['CREDIT'], amount: '30000', reference: null },
          check('POSTDATED_CHECK', '39500'),
        ])
      ).json(),
    ).toMatchObject({ code: 'PAYMENT_TERM_SINGLE' });

    const paid = await pay([check('POSTDATED_CHECK')]);
    expect(paid.statusCode, paid.body).toBe(200);
    expect((await t.db.invoice.findFirstOrThrow()).snapshot).toMatchObject({
      credit: {
        amount: '69500.00',
        instrument: { method: 'Chèque post-daté', number: '1234567', bank: 'BOA' },
      },
    });
    // Past its day, a check still in hand is not overdue: the bank has not answered yet.
    await t.db.receivable.updateMany({ data: { dueOn: new Date('2026-01-01') } });
    const [held] = (await receivables()).items;
    if (!held) throw new Error('no receivable');
    expect(held).toMatchObject({
      overdue: false,
      instrument: { method: 'Chèque post-daté', number: '1234567', bank: 'BOA', status: 'HANDED' },
    });
    expect((await settle(held.id, 'CASH', '1000')).json()).toMatchObject({
      code: 'RECEIVABLE_COVERED',
    });

    expect((await mark(held.id, 'UNPAID', s.cookies.cashier)).statusCode).toBe(403);
    const unpaid = await mark(held.id, 'UNPAID');
    expect(unpaid.statusCode, unpaid.body).toBe(200);
    expect(unpaid.json()).toMatchObject({ overdue: true, instrument: { status: 'UNPAID' } });
    expect((await mark(held.id, 'CASHED')).json()).toMatchObject({
      code: 'INSTRUMENT_NOT_HANDED',
    });
    expect((await settle(held.id, 'CASH', '69500')).statusCode).toBe(201);
    expect(await auditActions(t.db, held.id)).toEqual([
      'receivable.instrument_unpaid',
      'receivable.settled',
    ]);

    // A bill of exchange the bank paid closes the receivable without the register.
    order = await s.atRegister();
    expect((await pay([check('BILL_OF_EXCHANGE')])).statusCode).toBe(200);
    const [bill] = (await receivables()).items;
    if (!bill) throw new Error('no bill');
    expect((await mark(bill.id, 'CASHED')).json()).toMatchObject({
      paid: '69500.00',
      remaining: '0.00',
      status: 'SETTLED',
      instrument: { method: 'Traite', status: 'CASHED' },
    });
    expect((await receivables()).items).toEqual([]);
  });
});
