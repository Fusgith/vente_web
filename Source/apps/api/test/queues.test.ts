import { customerSchema, orderSchema, queueSchema, quoteSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
import { seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditEntries,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('register queue (RG-FIL-01 à 05)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '', otherCashier: '', manager: '', warehouse: '' };
  const ids = { vola: '', soa: '', customer: '', nails: '' };
  let published: Emission[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    ids.vola = (
      await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234', ticketLetter: 'A' })
    ).id;
    ids.soa = (await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '3456' })).id;
    await createUser(t.db, { username: 'rina', roles: ['cashier'], pin: '5678' });
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], pin: '4567' });
    for (const [key, username, role, pin] of [
      ['sales', 'vola', 'sales', '1234'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['otherCashier', 'rina', 'cashier', '5678'],
      ['manager', 'responsable', 'manager', '1234'],
      ['warehouse', 'feno', 'warehouse', '4567'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, pin })).cookie;
    const customer = await request(t.app, 'POST', '/api/v1/customers', {
      cookie: cookies.sales,
      body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.nails = await unitId(t.db, 'CLO-001', 'kg');
    published = [];
    vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
      published.push(...emissions);
    });
  });

  /** `count` orders validated one after the other: A1, A2… */
  async function validated(count: number): Promise<string[]> {
    const orderIds: string[] = [];
    for (let n = 0; n < count; n += 1) {
      const quote = await request(t.app, 'POST', '/api/v1/quotes', {
        cookie: cookies.sales,
        body: {
          customerId: ids.customer,
          lines: [{ productUnitId: ids.nails, qty: '1', discount: null }],
          orderDiscount: null,
        },
      });
      const { id } = quoteSchema.parse(quote.json());
      const submitted = await request(t.app, 'POST', `/api/v1/orders/${id}/submit`, {
        cookie: cookies.sales,
        body: { version: 1 },
      });
      expect(submitted.statusCode, submitted.body).toBe(200);
      orderIds.push(id);
    }
    published = [];
    return orderIds;
  }

  async function queue(cookie = cookies.cashier) {
    const response = await request(t.app, 'GET', '/api/v1/queues/register', { cookie });
    expect(response.statusCode, response.body).toBe(200);
    return queueSchema.parse(response.json());
  }
  const waitingIds = async () => (await queue()).waiting.map((item) => item.orderId);
  const post = (url: string, cookie: string, body?: unknown) =>
    request(t.app, 'POST', `/api/v1${url}`, { cookie, ...(body ? { body } : {}) });
  const callNext = (cookie = cookies.cashier) => post('/queues/register/call-next', cookie);

  it('lists the orders in their order of entry, for the register side only', async () => {
    const [a1, a2] = await validated(2);
    const { waiting, serving } = await queue();
    expect(serving).toEqual([]);
    expect(
      waiting.map((item) => [item.orderId, `${item.ticket.letter}${item.ticket.seq}`]),
    ).toEqual([
      [a1, 'A1'],
      [a2, 'A2'],
    ]);
    expect(waiting[0]).toMatchObject({
      customer: { name: 'Rasoa Hanta' },
      salesUser: { id: ids.vola },
      total: '6500.00',
      priority: false,
      noShowCount: 0,
      servedBy: null,
    });
    expect((await queue(cookies.manager)).waiting).toHaveLength(2);
    for (const cookie of [cookies.sales, cookies.warehouse]) {
      const refused = await request(t.app, 'GET', '/api/v1/queues/register', { cookie });
      expect(refused.statusCode).toBe(403);
    }
    // The delivery queue is the warehouse's; nothing is paid yet (T-051).
    const delivery = await request(t.app, 'GET', '/api/v1/queues/delivery', {
      cookie: cookies.warehouse,
    });
    expect(queueSchema.parse(delivery.json())).toEqual({
      queue: 'delivery',
      serving: [],
      waiting: [],
    });
  });

  it('calls the first waiting to the register, one customer at a time (RG-FIL-03)', async () => {
    const [a1, a2] = await validated(2);
    const called = await callNext();
    expect(called.statusCode, called.body).toBe(200);
    expect(orderSchema.parse(called.json())).toMatchObject({ id: a1, status: 'AT_REGISTER' });

    const { serving, waiting } = await queue();
    expect(serving).toMatchObject([{ orderId: a1, servedBy: { id: ids.soa }, station: null }]);
    expect(serving[0]?.calledAt).not.toBeNull();
    expect(waiting.map((item) => item.orderId)).toEqual([a2]);

    const busy = await callNext();
    expect(busy.statusCode).toBe(409);
    expect(busy.json().code).toBe('REGISTER_BUSY');
    expect((await callNext(cookies.otherCashier)).statusCode).toBe(200);
    const empty = await callNext(cookies.manager);
    expect(empty.statusCode).toBe(409);
    expect(empty.json().code).toBe('QUEUE_EMPTY');
    expect((await auditEntries(t.db)).filter(([action]) => action === 'order.called')).toEqual([
      ['order.called', null],
      ['order.called', null],
    ]);
  });

  it('never gives the same ticket to two registers calling at once', async () => {
    await validated(2);
    const answers = await Promise.all([callNext(), callNext(cookies.otherCashier)]);
    expect(answers.map((answer) => answer.statusCode)).toEqual([200, 200]);
    const [first, second] = answers.map((answer) => orderSchema.parse(answer.json()).id);
    expect(first).not.toBe(second);
  });

  it('calls a ticket out of turn when the customer is at the register, audited', async () => {
    const [, a2] = await validated(2);
    const called = await post(`/orders/${a2}/call`, cookies.cashier);
    expect(called.statusCode, called.body).toBe(200);
    expect(await auditEntries(t.db)).toContainEqual(['order.called', 'specific_ticket']);
    const again = await post(`/orders/${a2}/call`, cookies.otherCashier);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('ORDER_NOT_IN_QUEUE');
  });

  it('sends an absent customer to the end, reservation kept, the manager told at the 2nd time (RG-FIL-04)', async () => {
    const [a1, a2] = await validated(2);
    const stock = async () =>
      (
        await t.db.productStock.findFirstOrThrow({ where: { product: { sku: 'CLO-001' } } })
      ).reserved.toFixed(2);
    await callNext();
    // Only the register that called it, or the manager, says the customer is absent.
    expect((await post(`/orders/${a1}/no-show`, cookies.otherCashier)).statusCode).toBe(409);
    const absent = await post(`/orders/${a1}/no-show`, cookies.cashier);
    expect(absent.statusCode, absent.body).toBe(200);
    expect(orderSchema.parse(absent.json()).status).toBe('SUBMITTED');
    expect(await waitingIds()).toEqual([a2, a1]);
    expect(await stock()).toBe('2.00');
    expect(published.map((emission) => emission.event)).not.toContain('order.no_show');

    await post(`/orders/${a1}/call`, cookies.cashier);
    await post(`/orders/${a1}/no-show`, cookies.manager);
    expect((await queue()).waiting.at(-1)).toMatchObject({ orderId: a1, noShowCount: 2 });
    expect(published).toContainEqual({
      rooms: ['role:manager'],
      event: 'order.no_show',
      payload: { orderId: a1, noShowCount: 2 },
    });
  });

  it('tells the queue and, without a public display, the salesperson (RG-DSP-05)', async () => {
    const [a1] = await validated(1);
    await callNext();
    expect(published).toContainEqual({
      rooms: ['queue:register', `user:${ids.vola}`],
      event: 'ticket.called',
      payload: { queue: 'register', orderId: a1 },
    });
    expect(published).toContainEqual({
      rooms: ['queue:register'],
      event: 'queue.changed',
      payload: { queue: 'register', orderId: a1, change: 'called' },
    });
  });

  it('lets the manager reorder the queue, with a reason (RG-FIL-02)', async () => {
    const [a1, a2, a3] = await validated(3);
    const reorder = (body: unknown, cookie = cookies.manager) =>
      post('/queues/register/reorder', cookie, body);

    expect((await reorder({ orderId: a3, beforeId: a1, reason: 'Client âgé' })).statusCode).toBe(
      204,
    );
    expect(await waitingIds()).toEqual([a3, a1, a2]);
    expect((await reorder({ orderId: a3, beforeId: null })).statusCode).toBe(204);
    expect(await waitingIds()).toEqual([a1, a2, a3]);
    expect(await auditEntries(t.db)).toContainEqual(['queue.reordered', 'Client âgé']);

    // An order validated later still enters last.
    const [a4] = await validated(1);
    expect(await waitingIds()).toEqual([a1, a2, a3, a4]);
    expect((await reorder({ orderId: a1, beforeId: a1 })).statusCode).toBe(409);
    expect((await reorder({ orderId: a1, beforeId: null }, cookies.cashier)).statusCode).toBe(403);
  });

  it('puts a priority order behind the other priorities, ahead of the rest (RG-FIL-02)', async () => {
    const [a1, a2, a3] = (await validated(3)) as [string, string, string];
    const priority = (orderId: string, value: boolean) =>
      post('/queues/register/priority', cookies.manager, { orderId, priority: value });

    expect((await priority(a3, true)).statusCode).toBe(204);
    expect(await waitingIds()).toEqual([a3, a1, a2]);
    expect((await priority(a2, true)).statusCode).toBe(204);
    expect(await waitingIds()).toEqual([a3, a2, a1]);
    expect((await queue()).waiting.map((item) => item.priority)).toEqual([true, true, false]);
    // No longer priority: the order keeps its place.
    expect((await priority(a3, false)).statusCode).toBe(204);
    expect(await waitingIds()).toEqual([a3, a2, a1]);
    expect(orderSchema.parse((await callNext()).json()).id).toBe(a3);
  });

  it('takes the priority from an absent customer, and from an order placed last (RG-FIL-02, RG-FIL-04)', async () => {
    const [a1, a2, a3] = (await validated(3)) as [string, string, string];
    const priority = (orderId: string) =>
      post('/queues/register/priority', cookies.manager, { orderId, priority: true });
    const audit = (action: string) =>
      t.db.auditLog.findFirstOrThrow({ where: { action }, orderBy: { at: 'desc' } });

    await priority(a3);
    expect((await audit('queue.priority_set')).after).toEqual({
      queue: 'register',
      position: 1,
      priority: true,
    });
    await callNext();
    await post(`/orders/${a3}/no-show`, cookies.cashier);
    expect((await queue()).waiting.at(-1)).toMatchObject({ orderId: a3, priority: false });
    expect(await audit('order.no_show')).toMatchObject({
      before: { priority: true },
      after: { priority: false },
    });
    // The next priority no longer brings the absent customer back ahead.
    await priority(a2);
    expect(await waitingIds()).toEqual([a2, a1, a3]);

    // Placed last by the manager, a priority order is one like the others.
    await post('/queues/register/reorder', cookies.manager, { orderId: a2, beforeId: null });
    expect((await queue()).waiting.map((item) => [item.orderId, item.priority])).toEqual([
      [a1, false],
      [a3, false],
      [a2, false],
    ]);
    expect(await audit('queue.reordered')).toMatchObject({
      before: { position: 1, priority: true },
      after: { position: 3, priority: false },
    });
  });
});
