import { randomUUID } from 'node:crypto';

import {
  creditRequestListSchema,
  creditRequestSchema,
  receivableListSchema,
  type Order,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopDateValue } from '../src/services/shop-time.js';
import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import { auditActions, createStation, createTestApp, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('credit asked of the owner (T-095b, ⚠️ H76)', () => {
  let t: TestApp;
  let s: DiscountScene;
  let order: Order;
  let creditMethod: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    s = await discountScene(t);
    creditMethod = (await t.db.paymentMethod.findFirstOrThrow({ where: { code: 'CREDIT' } })).id;
    const stationId = (await createStation(t.db, 'REGISTER')).id;
    await s.post('/register-sessions', s.cookies.cashier, { stationId, openingFloat: '0' });
    // 4 packs of soap and 3 kg of nails: 119 500.
    order = await s.atRegister();
  });

  const ask = (amount = '119500', cookie = s.cookies.cashier) =>
    s.post('/credit-requests', cookie, { orderId: order.id, amount });
  const asked = async () => {
    const reply = await ask();
    expect(reply.statusCode, reply.body).toBe(201);
    return creditRequestSchema.parse(reply.json());
  };
  const payOnCredit = () =>
    s.post(
      `/orders/${order.id}/pay`,
      s.cookies.cashier,
      {
        version: order.version,
        lines: [{ methodId: creditMethod, amount: '119500', reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
  const board = async () => {
    const reply = await request(t.app, 'GET', '/api/v1/credit-requests', {
      cookie: s.cookies.manager,
    });
    expect(reply.statusCode, reply.body).toBe(200);
    return creditRequestListSchema.parse(reply.json());
  };

  it('asks once, with why the conditions refuse it; the owner grants it and the register pays', async () => {
    const created = await asked();
    expect(created).toMatchObject({
      status: 'PENDING',
      amount: '119500.00',
      refusal: 'NO_CONDITION',
      outstanding: '0.00',
      order: { id: order.id, total: '119500.00' },
    });
    expect((await ask()).json()).toMatchObject({ code: 'CREDIT_REQUEST_PENDING' });
    expect((await ask('119500', s.cookies.otherCashier)).json()).toMatchObject({
      code: 'ORDER_NOT_AT_REGISTER',
    });
    expect((await board()).pending.map((row) => row.id)).toEqual([created.id]);
    expect((await payOnCredit()).json()).toMatchObject({ code: 'CREDIT_NOT_ALLOWED' });

    const grant = await s.post(`/credit-requests/${created.id}/grant`, s.cookies.owner, {
      days: 15,
    });
    expect(grant.statusCode, grant.body).toBe(200);
    expect(creditRequestSchema.parse(grant.json())).toMatchObject({ status: 'GRANTED', days: 15 });
    expect(
      (await s.post(`/credit-requests/${created.id}/reject`, s.cookies.owner)).json(),
    ).toMatchObject({ code: 'CREDIT_REQUEST_NOT_PENDING' });
    expect(await board()).toMatchObject({ pending: [], recent: [{ id: created.id }] });

    const paid = await payOnCredit();
    expect(paid.statusCode, paid.body).toBe(200);
    const list = await request(t.app, 'GET', '/api/v1/receivables', { cookie: s.cookies.cashier });
    const due = new Date(shopDateValue(new Date()).getTime() + 15 * 86_400_000);
    expect(receivableListSchema.parse(list.json()).items).toMatchObject([
      { amount: '119500.00', dueOn: due.toISOString().slice(0, 10) },
    ]);
    expect(await auditActions(t.db, created.id)).toEqual([
      'credit_request.created',
      'credit_request.granted',
    ]);
  });

  it('refused, the credit stays refused; within the conditions, nothing to ask', async () => {
    const created = await asked();
    const reject = await s.post(`/credit-requests/${created.id}/reject`, s.cookies.owner);
    expect(reject.statusCode, reject.body).toBe(200);
    expect(creditRequestSchema.parse(reject.json()).status).toBe('REJECTED');
    expect((await payOnCredit()).json()).toMatchObject({ code: 'CREDIT_NOT_ALLOWED' });

    const condition = await s.post('/credit-conditions', s.cookies.owner, {
      customerType: 'INDIVIDUAL',
      customerCategory: null,
      customerId: null,
      ceiling: '200000',
      days: 30,
      isActive: true,
    });
    expect(condition.statusCode, condition.body).toBe(201);
    expect((await ask()).json()).toMatchObject({ code: 'CREDIT_ALLOWED' });
  });
});
