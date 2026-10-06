import { randomUUID } from 'node:crypto';

import { customerSchema, quoteSchema, supervisionTodaySchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopDayStart } from '../src/services/shop-time.js';
import { seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const MINUTE = 60_000;

describe.skipIf(!TEST_DATABASE_URL)('the manager’s day at a glance (RG-DSP-04, H38)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '', warehouse: '', manager: '' };
  let customer = '';
  let soapPack = '';
  let cash = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    cash = (await seedPaymentMethods(t.db))['CASH'] ?? '';
    await createUser(t.db, {
      username: 'vola',
      roles: ['sales'],
      password: '1234',
      ticketLetter: 'A',
    });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], password: '4567' });
    for (const [key, username, role, password] of [
      ['sales', 'vola', 'sales', '1234'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['warehouse', 'feno', 'warehouse', '4567'],
      ['manager', 'responsable', 'manager', '1234'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
    const created = await post('/customers', cookies.sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    customer = customerSchema.parse(created.json()).id;
    soapPack = await unitId(t.db, 'SAV-001', 'paquet');
    const register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.cashier, { stationId: register, openingFloat: '0' });
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }

  /** 2 packs of soap (50 000,00 MGA), validated; paid too when asked. */
  async function validated(pay: boolean): Promise<string> {
    const quote = await post('/quotes', cookies.sales, {
      customerId: customer,
      lines: [{ productUnitId: soapPack, qty: '2', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    if (!pay) return id;
    await post(`/orders/${id}/call`, cookies.cashier);
    const payment = await post(
      `/orders/${id}/pay`,
      cookies.cashier,
      {
        version: 3,
        lines: [{ methodId: cash, amount: '50000', reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
    expect(payment.statusCode, payment.body).toBe(200);
    return id;
  }

  const today = (cookie: string) => request(t.app, 'GET', '/api/v1/supervision/today', { cookie });

  it('averages the waits of the day, then counts what is under way', async () => {
    expect(supervisionTodaySchema.parse((await today(cookies.manager)).json())).toEqual({
      registerWait: null,
      deliveryWait: null,
      inProgress: 0,
      paidUndelivered: { count: 0, total: '0.00' },
    });

    const [taken, yesterday] = [await validated(true), await validated(true)];
    await validated(false);
    expect((await post('/queues/delivery/take-next', cookies.warehouse)).statusCode).toBe(200);
    // The times set apart: waited 6 minutes today; called yesterday, it does not count.
    const day = shopDayStart(new Date()).getTime();
    const at = (minutes: number) => new Date(day + minutes * MINUTE);
    await t.db.order.update({
      where: { id: taken },
      data: { submittedAt: at(60), calledAt: at(66), paidAt: at(70) },
    });
    await t.db.delivery.updateMany({ where: { orderId: taken }, data: { startedAt: at(72) } });
    await t.db.order.update({
      where: { id: yesterday },
      data: { submittedAt: at(-120), calledAt: at(-60) },
    });

    expect(supervisionTodaySchema.parse((await today(cookies.manager)).json())).toEqual({
      registerWait: 6,
      deliveryWait: 2,
      inProgress: 3,
      paidUndelivered: { count: 2, total: '100000.00' },
    });
  });

  it('is the manager’s and the owner’s only', async () => {
    expect((await today(cookies.cashier)).statusCode).toBe(403);
    expect((await today(cookies.sales)).statusCode).toBe(403);
  });
});
