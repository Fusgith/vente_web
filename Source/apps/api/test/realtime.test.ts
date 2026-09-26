import type { AddressInfo } from 'node:net';

import { REALTIME_PATH, customerSchema, quoteSchema } from '@vente-web/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { unitId, seedDemoCatalog } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('realtime channel (CDC technique §6.1, T-018)', () => {
  let t: TestApp;
  let base: string;
  const open: Socket[] = [];
  const cookies = { sales: '', cashier: '', warehouse: '', manager: '' };

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen({ host: '127.0.0.1', port: 0 });
    base = `http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}`;
  });
  afterAll(() => t.close());
  afterEach(() => {
    for (const socket of open.splice(0)) socket.disconnect();
  });
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234', ticketLetter: 'A' });
    await createUser(t.db, { username: 'soa', roles: ['cashier', 'manager'], pin: '3456' });
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], pin: '4567' });
    for (const [key, username, role, pin] of [
      ['sales', 'vola', 'sales', '1234'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['warehouse', 'feno', 'warehouse', '4567'],
      ['manager', 'responsable', 'manager', '1234'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, pin })).cookie;
  });

  /** A browser tab of the shop's page: same Origin, the session cookie. */
  function connect(cookie: string | null, headers: Record<string, string> = {}): Promise<Socket> {
    const socket = io(base, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      extraHeaders: {
        origin: base,
        ...(cookie ? { cookie: `vw_session=${cookie}` } : {}),
        ...headers,
      },
    });
    open.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
    });
  }

  const refusal = (promise: Promise<Socket>) =>
    promise.then(
      () => 'connected',
      (error: Error) => error.message,
    );

  function next<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event}`)), 2000);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  /** Collects `event` for a moment: what a connection outside the rooms must never get. */
  function collect(socket: Socket, event: string): unknown[] {
    const seen: unknown[] = [];
    socket.on(event, (payload: unknown) => seen.push(payload));
    return seen;
  }

  async function validatedOrder(): Promise<string> {
    const customer = await request(t.app, 'POST', '/api/v1/customers', {
      cookie: cookies.sales,
      body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
    });
    const quote = await request(t.app, 'POST', '/api/v1/quotes', {
      cookie: cookies.sales,
      body: {
        customerId: customerSchema.parse(customer.json()).id,
        lines: [{ productUnitId: await unitId(t.db, 'CLO-001', 'kg'), qty: '2', discount: null }],
        orderDiscount: null,
      },
    });
    const { id } = quoteSchema.parse(quote.json());
    const submitted = await request(t.app, 'POST', `/api/v1/orders/${id}/submit`, {
      cookie: cookies.sales,
      body: { version: 1 },
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    return id;
  }

  it('tells the register queue and the salesperson that an order was validated (RG-CMD-03)', async () => {
    const [cashier, manager, sales, warehouse] = await Promise.all([
      connect(cookies.cashier),
      connect(cookies.manager),
      connect(cookies.sales),
      connect(cookies.warehouse),
    ]);
    const cashierQueue = next(cashier, 'queue.changed');
    const managerQueue = next(manager, 'queue.changed');
    const managerStatus = next(manager, 'order.status_changed');
    const salesStatus = next(sales, 'order.status_changed');
    const salesQueue = collect(sales, 'queue.changed');
    const warehouseSeen = [
      ...collect(warehouse, 'queue.changed'),
      ...collect(warehouse, 'order.status_changed'),
    ];

    const orderId = await validatedOrder();

    // Identifiers only: each screen reads the order again with its own rights.
    expect(await cashierQueue).toEqual({ queue: 'register', orderId });
    expect(await managerQueue).toEqual({ queue: 'register', orderId });
    expect(await managerStatus).toEqual({ orderId, status: 'SUBMITTED' });
    expect(await salesStatus).toEqual({ orderId, status: 'SUBMITTED' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(salesQueue).toEqual([]);
    expect(warehouseSeen).toEqual([]);
  });

  it('refuses a handshake from another site, or without a live session', async () => {
    expect(await refusal(connect(cookies.cashier, { origin: 'https://evil.example' }))).not.toBe(
      'connected',
    );
    expect(await refusal(connect(cookies.cashier, { 'sec-fetch-site': 'cross-site' }))).not.toBe(
      'connected',
    );
    expect(await refusal(connect(null))).toBe('AUTH_REQUIRED');
    expect(await refusal(connect('forged-token'))).toBe('AUTH_REQUIRED');
    // A session opened in the shop never works from outside (CDC technique §2.2).
    expect(await refusal(connect(cookies.sales, { 'x-access-origin': 'remote' }))).toBe(
      'AUTH_ORIGIN_MISMATCH',
    );
  });

  it('never counts an open connection as activity (⚠️ H19)', async () => {
    const before = new Date(Date.now() - 3 * 60_000);
    await t.db.session.updateMany({ data: { lastSeenAt: before } });
    await connect(cookies.cashier);
    await t.app.realtime.revalidate();
    const sessions = await t.db.session.findMany({ select: { lastSeenAt: true } });
    expect(sessions.every((row) => row.lastSeenAt.getTime() === before.getTime())).toBe(true);
  });

  it('drops a connection whose session ended or changed role', async () => {
    const [cashier, sales] = await Promise.all([connect(cookies.cashier), connect(cookies.sales)]);
    const cashierGone = next<string>(cashier, 'disconnect');
    const salesGone = next<string>(sales, 'disconnect');

    await request(t.app, 'POST', '/api/v1/auth/switch-role', {
      cookie: cookies.cashier,
      body: { role: 'manager' },
    });
    await request(t.app, 'POST', '/api/v1/auth/logout', { cookie: cookies.sales });
    await t.app.realtime.revalidate();

    expect(await cashierGone).toBe('io server disconnect');
    expect(await salesGone).toBe('io server disconnect');
  });
});
