import { customerSchema, queueSchema, quoteSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../src/db.js';
import { expireOrders } from '../src/services/expiry.js';
import type { Emission } from '../src/services/realtime-rooms.js';
import { productId, seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('orders expired at the day end (RG-CMD-08, RG-STK-02)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '' };
  const ids = { vola: '', customer: '', nails: '', nailsUnit: '' };
  let published: Emission[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    ids.vola = (
      await createUser(t.db, {
        username: 'vola',
        roles: ['sales'],
        password: '1234',
        ticketLetter: 'A',
      })
    ).id;
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    cookies.sales = (
      await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })
    ).cookie;
    cookies.cashier = (
      await loginOk(t.app, { username: 'soa', role: 'cashier', password: '3456' })
    ).cookie;
    const customer = await request(t.app, 'POST', '/api/v1/customers', {
      cookie: cookies.sales,
      body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.nails = await productId(t.db, 'CLO-001');
    ids.nailsUnit = await unitId(t.db, 'CLO-001', 'kg');
    published = [];
    vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
      published.push(...emissions);
    });
  });

  const post = (url: string, cookie: string, body?: unknown) =>
    request(t.app, 'POST', `/api/v1${url}`, { cookie, ...(body ? { body } : {}) });

  /** An order of `qty` kg of nails, validated. */
  async function validated(qty: string): Promise<string> {
    const quote = await post('/quotes', cookies.sales, {
      customerId: ids.customer,
      lines: [{ productUnitId: ids.nailsUnit, qty, discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    expect((await post(`/orders/${id}/submit`, cookies.sales, { version: 1 })).statusCode).toBe(
      200,
    );
    return id;
  }

  /** The day end passed for these orders: their deadline an hour ago. */
  async function dayEnded(...orderIds: string[]) {
    const past = new Date(Date.now() - 3_600_000);
    await t.db.order.updateMany({ where: { id: { in: orderIds } }, data: { expiresAt: past } });
    await t.db.reservation.updateMany({
      where: { orderId: { in: orderIds } },
      data: { expiresAt: past },
    });
  }

  const reserved = async () =>
    (
      await t.db.productStock.findUniqueOrThrow({ where: { productId: ids.nails } })
    ).reserved.toFixed(2);
  const status = async (id: string) =>
    (await t.db.order.findUniqueOrThrow({ where: { id } })).status;

  it('expires the unpaid orders in the queue, freeing their stock, audited', async () => {
    const waiting = await validated('2');
    const called = await validated('3');
    const tomorrow = await validated('4');
    expect((await post(`/orders/${called}/call`, cookies.cashier)).statusCode).toBe(200);
    await dayEnded(waiting, called);
    expect(await reserved()).toBe('9.00');
    published = [];

    expect(await t.app.expiry.sweep()).toEqual([{ id: waiting, salesUserId: ids.vola }]);

    expect(await status(waiting)).toBe('EXPIRED');
    // At the register, the customer is the cashier's; still to come, the order waits its day end.
    expect(await status(called)).toBe('AT_REGISTER');
    expect(await status(tomorrow)).toBe('SUBMITTED');
    expect(await reserved()).toBe('7.00');
    const released = await t.db.reservation.findFirstOrThrow({ where: { orderId: waiting } });
    expect(released.status).toBe('RELEASED');

    const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: 'order.expired' } });
    expect(audit).toMatchObject({
      userId: null,
      entityId: waiting,
      before: { status: 'SUBMITTED' },
      after: { status: 'EXPIRED' },
    });
    expect(published).toEqual([
      {
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId: waiting, change: 'expired' },
      },
      {
        rooms: ['role:manager', 'role:owner', `user:${ids.vola}`],
        event: 'order.status_changed',
        payload: { orderId: waiting, status: 'EXPIRED' },
      },
    ]);
    const queue = await request(t.app, 'GET', '/api/v1/queues/register', {
      cookie: cookies.cashier,
    });
    expect(queueSchema.parse(queue.json()).waiting.map((item) => item.orderId)).toEqual([tomorrow]);
    // Done once: a second sweep finds nothing, and an expired order is no longer cancelled.
    expect(await t.app.expiry.sweep()).toEqual([]);
    const cancel = await post(`/orders/${waiting}/cancel`, cookies.sales, {
      version: 3,
      reason: 'Trop tard',
    });
    expect(cancel.json().code).toBe('ORDER_NOT_CANCELLABLE');
  });

  it('never calls an order past its day end, even before the sweep', async () => {
    const [late, next] = [await validated('2'), await validated('3')];
    await dayEnded(late);
    const called = await post('/queues/register/call-next', cookies.cashier);
    expect(called.json().id).toBe(next);
    expect((await post(`/orders/${next}/no-show`, cookies.cashier)).statusCode).toBe(200);
    const specific = await post(`/orders/${late}/call`, cookies.cashier);
    expect([specific.statusCode, specific.json().code]).toEqual([409, 'ORDER_NOT_IN_QUEUE']);
  });

  it('expires a customer sent back to the queue after the day end', async () => {
    const order = await validated('2');
    await post('/queues/register/call-next', cookies.cashier);
    await dayEnded(order);
    expect(await t.app.expiry.sweep()).toEqual([]);
    expect((await post(`/orders/${order}/no-show`, cookies.cashier)).statusCode).toBe(200);
    expect(await t.app.expiry.sweep()).toEqual([{ id: order, salesUserId: ids.vola }]);
    expect(await reserved()).toBe('0.00');
  });

  it('expires the other orders when one of them fails, and tells of those', async () => {
    const [first, second] = [await validated('2'), await validated('3')];
    await dayEnded(first, second);
    let calls = 0;
    const flaky = new Proxy(t.db, {
      get(target, property, receiver) {
        if (property === '$transaction' && calls++ === 0) {
          return () => Promise.reject(new Error('deadlock'));
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    }) as Db;
    const onError = vi.fn();
    const expired = await expireOrders(flaky, onError);
    expect(expired).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(1);
    const failed = onError.mock.calls[0]?.[0] as string;
    expect(await status(failed)).toBe('SUBMITTED');
    // Tried again at the next sweep.
    expect(await t.app.expiry.sweep()).toEqual([{ id: failed, salesUserId: ids.vola }]);
    expect([first, second]).toContain(failed);
  });
});
