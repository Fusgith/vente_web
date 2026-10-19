import { randomUUID } from 'node:crypto';

import { customerSchema, orderSchema, queueSchema, quoteSchema } from '@vente-web/shared';
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

describe.skipIf(!TEST_DATABASE_URL)('delivery at the counters (RG-LIV-01 à 03, H34)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '', feno: '', tahina: '', manager: '' };
  const ids = { customer: '', soap: '', soapPack: '', feno: '' };
  let cash = '';
  let published: Emission[] = [];

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
    ids.feno = (
      await createUser(t.db, { username: 'feno', roles: ['warehouse'], password: '4567' })
    ).id;
    await createUser(t.db, { username: 'tahina', roles: ['warehouse'], password: '5678' });
    for (const [key, username, role, password] of [
      ['sales', 'vola', 'sales', '1234'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['feno', 'feno', 'warehouse', '4567'],
      ['tahina', 'tahina', 'warehouse', '5678'],
      ['manager', 'responsable', 'manager', '1234'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
    const customer = await post('/customers', cookies.sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.soap = await productId(t.db, 'SAV-001');
    ids.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
    const register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.cashier, { stationId: register, openingFloat: '0' });
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

  /** 2 packs of soap (12 pieces, 50 000,00 MGA), validated, paid: in the delivery queue. */
  async function paid(): Promise<string> {
    const quote = await post('/quotes', cookies.sales, {
      customerId: ids.customer,
      lines: [{ productUnitId: ids.soapPack, qty: '2', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
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
    published = [];
    return id;
  }

  const takeNext = (cookie = cookies.feno) => post('/queues/delivery/take-next', cookie);
  const act = (id: string, action: string, cookie = cookies.feno, body?: unknown) =>
    post(`/orders/${id}/delivery/${action}`, cookie, body);
  const code = async (response: Awaited<ReturnType<typeof post>>) =>
    [response.statusCode, response.json().code] as const;
  const queue = async () =>
    queueSchema.parse(
      (await request(t.app, 'GET', '/api/v1/queues/delivery', { cookie: cookies.feno })).json(),
    );
  const stock = async () => {
    const row = await t.db.productStock.findUniqueOrThrow({ where: { productId: ids.soap } });
    return [row.onHand.toFixed(2), row.reserved.toFixed(2)];
  };

  it('takes, prepares, calls, then hands over line by line: the stock goes out (RG-STK-04)', async () => {
    const order = await paid();
    const [onHand] = await stock();
    const taken = await takeNext();
    expect(taken.statusCode, taken.body).toBe(200);
    expect(orderSchema.parse(taken.json())).toMatchObject({ id: order, status: 'PREPARING' });
    expect((await queue()).serving).toMatchObject([
      { orderId: order, servedBy: { id: ids.feno }, status: 'PREPARING' },
    ]);
    // One order at a time; the order read by the counter, lines included.
    expect(await code(await takeNext())).toEqual([409, 'COUNTER_BUSY']);
    const read = await request(t.app, 'GET', `/api/v1/orders/${order}`, { cookie: cookies.feno });
    expect(orderSchema.parse(read.json()).lines).toHaveLength(1);

    const ready = await act(order, 'ready');
    expect(orderSchema.parse(ready.json())).toMatchObject({ status: 'READY', version: 6 });
    expect(published).toContainEqual({
      rooms: ['queue:delivery', 'display'],
      event: 'ticket.called',
      payload: { queue: 'delivery', orderId: order },
    });

    expect(
      await code(await act(order, 'deliver', cookies.feno, { version: 6, delivered: [2] })),
    ).toEqual([409, 'DELIVERY_INCOMPLETE']);
    const delivered = await act(order, 'deliver', cookies.feno, { version: 6, delivered: [1] });
    expect(delivered.statusCode, delivered.body).toBe(200);
    expect(orderSchema.parse(delivered.json()).status).toBe('DELIVERED');

    // 2 packs × 6 = 12 pieces out of the stock and out of the reserved.
    expect(await stock()).toEqual([(Number(onHand) - 12).toFixed(2), '0.00']);
    const movement = await t.db.stockMovement.findFirstOrThrow({
      where: { orderId: order, type: 'DELIVERY' },
    });
    expect([movement.qty.toFixed(2), movement.unitQty?.toFixed(2)]).toEqual(['-12.00', '2.00']);
    expect((await t.db.reservation.findFirstOrThrow({ where: { orderId: order } })).status).toBe(
      'CONSUMED',
    );
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: 'order.delivered' } });
    expect(audit.after).toMatchObject({
      status: 'DELIVERED',
      stockOut: [{ sku: 'SAV-001', qty: '2', unit: 'paquet', baseQty: '12.00' }],
    });
    expect((await queue()).serving).toEqual([]);
    // Free again for the next one.
    expect(await code(await takeNext())).toEqual([409, 'QUEUE_EMPTY']);
  });

  it('shows the warehouse only the orders paid', async () => {
    const quote = await post('/quotes', cookies.sales, {
      customerId: ids.customer,
      lines: [{ productUnitId: ids.soapPack, qty: '1', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    const read = () => request(t.app, 'GET', `/api/v1/orders/${id}`, { cookie: cookies.feno });
    expect(await code(await read())).toEqual([403, 'AUTH_FORBIDDEN']);
    const order = await paid();
    const paidRead = await request(t.app, 'GET', `/api/v1/orders/${order}`, {
      cookie: cookies.feno,
    });
    expect(paidRead.statusCode).toBe(200);
  });

  it('holds an order for one warehouse user only (RG-USR-08)', async () => {
    const [first, second] = [await paid(), await paid()];
    await takeNext();
    expect(await code(await act(first, 'ready', cookies.tahina))).toEqual([
      409,
      'ORDER_NOT_AT_COUNTER',
    ]);
    const other = await takeNext(cookies.tahina);
    expect(orderSchema.parse(other.json()).id).toBe(second);
    expect((await act(first, 'ready', cookies.sales)).statusCode).toBe(403);
    // Out of turn, the customer at the counter: audited as such.
    const third = await paid();
    await act(first, 'release', cookies.manager);
    expect((await act(third, 'take')).statusCode).toBe(200);
    const audit = await t.db.auditLog.findFirstOrThrow({
      where: { action: 'order.preparing', entityId: third },
    });
    expect(audit.reason).toBe('specific_ticket');
  });

  it('sends an absent customer to the end of the queue, still paid (RG-FIL-06)', async () => {
    const [first, second] = [await paid(), await paid()];
    await takeNext();
    await act(first, 'ready');
    const absent = await act(first, 'no-show');
    expect(orderSchema.parse(absent.json())).toMatchObject({ status: 'PAID' });
    expect((await queue()).waiting.map((item) => [item.orderId, item.noShowCount])).toEqual([
      [second, 0],
      [first, 1],
    ]);
    // The reservation stays firm; the counter is free for the next one.
    expect(
      (await t.db.reservation.findFirstOrThrow({ where: { orderId: first } })).expiresAt,
    ).toBeNull();
    expect(orderSchema.parse((await takeNext()).json()).id).toBe(second);
    expect(await code(await act(first, 'no-show'))).toEqual([409, 'ORDER_NOT_AT_COUNTER']);
  });

  it('lets the manager give an order back to the queue, at its place (reassignment)', async () => {
    const [first, second] = [await paid(), await paid()];
    await takeNext();
    expect((await act(first, 'release', cookies.feno)).statusCode).toBe(403);
    const released = await act(first, 'release', cookies.manager);
    expect(orderSchema.parse(released.json()).status).toBe('PAID');
    expect((await queue()).waiting.map((item) => item.orderId)).toEqual([first, second]);
    expect(await t.db.auditLog.count({ where: { action: 'order.released' } })).toBe(1);
    expect(published).toContainEqual({
      rooms: ['queue:delivery'],
      event: 'queue.changed',
      payload: { queue: 'delivery', orderId: first, change: 'released' },
    });
    // Another warehouse user takes it; Feno is free again.
    expect(orderSchema.parse((await takeNext(cookies.tahina)).json()).id).toBe(first);
    expect(orderSchema.parse((await takeNext()).json()).id).toBe(second);
  });

  it('gives a released order its place back after the queue was reordered (RG-FIL-02)', async () => {
    const [first, second, third] = [await paid(), await paid(), await paid()];
    await takeNext();
    const reordered = await post('/queues/delivery/reorder', cookies.manager, {
      orderId: third,
      beforeId: second,
      reason: '',
    });
    expect(reordered.statusCode, reordered.body).toBe(204);
    const fourth = await paid();
    await act(first, 'release', cookies.manager);
    expect((await queue()).waiting.map((item) => item.orderId)).toEqual([
      first,
      third,
      second,
      fourth,
    ]);
  });
});
