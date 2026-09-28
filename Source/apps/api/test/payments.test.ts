import { randomUUID } from 'node:crypto';

import {
  customerSchema,
  orderSchema,
  paymentSchema,
  queueSchema,
  quoteSchema,
  type Order,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
import { productId, seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('payment at the register (RG-PAY, H32)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '', otherCashier: '', manager: '' };
  const ids = { vola: '', customer: '', nails: '', nailsUnit: '', register: '' };
  let methods: Record<string, string> = {};
  let published: Emission[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    methods = await seedPaymentMethods(t.db);
    ids.vola = (
      await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234', ticketLetter: 'A' })
    ).id;
    await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '3456' });
    await createUser(t.db, { username: 'rina', roles: ['cashier'], pin: '5678' });
    for (const [key, username, role, pin] of [
      ['sales', 'vola', 'sales', '1234'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['otherCashier', 'rina', 'cashier', '5678'],
      ['manager', 'responsable', 'manager', '1234'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, pin })).cookie;
    const customer = await post('/customers', cookies.sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.nails = await productId(t.db, 'CLO-001');
    ids.nailsUnit = await unitId(t.db, 'CLO-001', 'kg');
    ids.register = (await createStation(t.db, 'REGISTER')).id;
    published = [];
    vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
      published.push(...emissions);
    });
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }

  /** 10 kg of nails (65 000,00 MGA), validated, the register opened, then called to it. */
  async function atRegister(cookie = cookies.cashier): Promise<Order> {
    const quote = await post('/quotes', cookies.sales, {
      customerId: ids.customer,
      lines: [{ productUnitId: ids.nailsUnit, qty: '10', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    await post('/register-sessions', cookie, { stationId: ids.register, openingFloat: '20000' });
    const called = await post(`/orders/${id}/call`, cookie);
    expect(called.statusCode, called.body).toBe(200);
    published = [];
    return orderSchema.parse(called.json());
  }

  const pay = (order: Order, body: object, key = randomUUID(), cookie = cookies.cashier) =>
    post(`/orders/${order.id}/pay`, cookie, { version: order.version, ...body }, key);
  const cash = (amount: string) => ({ methodId: methods['CASH'], amount, reference: null });
  const code = async (response: Awaited<ReturnType<typeof pay>>) =>
    [response.statusCode, response.json().code] as const;

  it('takes cash, gives the change, the order paid and off to delivery (RG-PAY-03, RG-LIV-01)', async () => {
    const order = await atRegister();
    expect(order).toMatchObject({ total: '65000.00' });
    const response = await pay(order, { lines: [cash('65000')], cashReceived: '70000' });
    expect(response.statusCode, response.body).toBe(200);
    const paid = response.json();
    expect(orderSchema.parse(paid.order)).toMatchObject({ status: 'PAID', expiresAt: null });
    expect(paymentSchema.parse(paid.payment)).toMatchObject({
      totalDue: '65000.00',
      cashReceived: '70000.00',
      changeGiven: '5000.00',
      lines: [{ method: { code: 'CASH', label: 'Espèces' }, amount: '65000.00', reference: null }],
    });

    // The reservation is firm until delivery (RG-STK-03), the call named the register.
    const reservation = await t.db.reservation.findFirstOrThrow({ where: { orderId: order.id } });
    expect(reservation).toMatchObject({ status: 'ACTIVE', expiresAt: null });
    const stored = await t.db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.registerStationId).toBe(ids.register);
    expect(await t.app.expiry.sweep()).toEqual([]);

    const queue = async (name: string) =>
      queueSchema.parse(
        (await request(t.app, 'GET', `/api/v1/queues/${name}`, { cookie: cookies.manager })).json(),
      );
    expect((await queue('register')).serving).toEqual([]);
    expect((await queue('delivery')).waiting.map((item) => item.orderId)).toEqual([order.id]);
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: 'order.paid' } });
    expect(audit.after).toMatchObject({
      status: 'PAID',
      lines: [{ method: 'CASH', amount: '65000.00', reference: null }],
      change: '5000.00',
    });
    expect(published).toEqual([
      {
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId: order.id, change: 'paid' },
      },
      {
        rooms: ['queue:delivery'],
        event: 'queue.changed',
        payload: { queue: 'delivery', orderId: order.id, change: 'entered' },
      },
      {
        rooms: ['role:manager', 'role:owner', `user:${ids.vola}`],
        event: 'order.status_changed',
        payload: { orderId: order.id, status: 'PAID' },
      },
    ]);
  });

  it('adds a mixed payment up to the amount due, with its references (RG-PAY-02/04)', async () => {
    const order = await atRegister();
    const mvola = (reference: string | null) => ({
      methodId: methods['MVOLA'],
      amount: '60000',
      reference,
    });
    expect(
      await code(await pay(order, { lines: [mvola(null), cash('5000')], cashReceived: null })),
    ).toEqual([422, 'PAYMENT_REFERENCE_REQUIRED']);
    expect(
      await code(await pay(order, { lines: [mvola('MP1'), cash('4000')], cashReceived: null })),
    ).toEqual([422, 'PAYMENT_TOTAL_MISMATCH']);
    expect(
      await code(await pay(order, { lines: [mvola('MP1'), cash('5000')], cashReceived: '4000' })),
    ).toEqual([422, 'PAYMENT_CASH_SHORT']);
    expect(
      await code(await pay(order, { lines: [cash('60000'), cash('5000')], cashReceived: null })),
    ).toEqual([422, 'PAYMENT_CASH_TWICE']);
    await t.db.paymentMethod.update({ where: { code: 'CHEQUE' }, data: { isActive: false } });
    const cheque = { methodId: methods['CHEQUE'], amount: '65000', reference: 'CH-1' };
    expect(await code(await pay(order, { lines: [cheque], cashReceived: null }))).toEqual([
      409,
      'PAYMENT_METHOD_INVALID',
    ]);

    const response = await pay(order, {
      lines: [mvola(' MP240928 '), cash('5000')],
      cashReceived: '10000',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(paymentSchema.parse(response.json().payment)).toMatchObject({
      changeGiven: '5000.00',
      lines: [
        { method: { code: 'MVOLA' }, amount: '60000.00', reference: 'MP240928' },
        { method: { code: 'CASH' }, amount: '5000.00' },
      ],
    });
    expect(await t.db.payment.count()).toBe(1);
  });

  it('records a payment sent twice once (idempotency)', async () => {
    const order = await atRegister();
    const key = randomUUID();
    const body = { lines: [cash('65000')], cashReceived: null };
    const [first, second] = await Promise.all([pay(order, body, key), pay(order, body, key)]);
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(first.json().payment.id).toBe(second.json().payment.id);
    expect(await t.db.payment.count()).toBe(1);
    // Another key is another payment: the order is no longer at the register.
    expect(await code(await pay(order, body))).toEqual([409, 'ORDER_NOT_AT_REGISTER']);
    const noKey = await post(`/orders/${order.id}/pay`, cookies.cashier, { version: 3, ...body });
    expect(noKey.json().code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('pays only at the register that called, open, in the version read (RG-CAI-02)', async () => {
    const order = await atRegister();
    const body = { lines: [cash('65000')], cashReceived: null };
    expect(await code(await pay(order, body, randomUUID(), cookies.otherCashier))).toEqual([
      409,
      'ORDER_NOT_AT_REGISTER',
    ]);
    expect((await pay(order, body, randomUUID(), cookies.sales)).statusCode).toBe(403);
    expect(await code(await pay({ ...order, version: order.version - 1 }, body))).toEqual([
      409,
      'ORDER_CHANGED',
    ]);
    // The manager takes payments on a register session of their own.
    expect(await code(await pay(order, body, randomUUID(), cookies.manager))).toEqual([
      409,
      'REGISTER_SESSION_REQUIRED',
    ]);
    const other = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.manager, { stationId: other, openingFloat: '0' });
    expect((await pay(order, body, randomUUID(), cookies.manager)).statusCode).toBe(200);
  });
});
