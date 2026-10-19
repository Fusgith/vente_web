import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import {
  DISPLAY_KEY_AUTH,
  REALTIME_PATH,
  customerSchema,
  displayBoardSchema,
  quoteSchema,
} from '@vente-web/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearSettingsCache } from '../src/services/settings.js';
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

const KEY = 'ECRAN-TEST-1';

describe.skipIf(!TEST_DATABASE_URL)('public display (T-041, RG-DSP-01 à 03)', () => {
  let t: TestApp;
  let base: string;
  let cash = '';
  const open: Socket[] = [];
  const cookies = { sales: '', cashier: '', warehouse: '' };

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
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
    const register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.cashier, { stationId: register, openingFloat: '0' });
    await t.db.station.create({
      data: { type: 'DISPLAY', name: 'Écran public', displayKey: KEY },
    });
    await displayOn(true);
  });

  async function displayOn(value: boolean) {
    await t.db.setting.upsert({
      where: { key: 'display.enabled' },
      create: { key: 'display.enabled', value },
      update: { value },
    });
    clearSettingsCache();
  }

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }

  const board = (key = KEY) => request(t.app, 'GET', `/api/v1/display/${key}`);

  /** The display's page: same Origin, no cookie, its key in the handshake. */
  function connect(key: string): Promise<Socket> {
    const socket = io(base, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: { [DISPLAY_KEY_AUTH]: key },
      extraHeaders: { origin: base },
    });
    open.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
    });
  }

  function next<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event}`)), 2000);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  /** 1 kg of nails validated: ticket A1 in the register queue. */
  async function validated(): Promise<string> {
    const customer = await post('/customers', cookies.sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    const quote = await post('/quotes', cookies.sales, {
      customerId: customerSchema.parse(customer.json()).id,
      lines: [{ productUnitId: await unitId(t.db, 'CLO-001', 'kg'), qty: '1', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    return id;
  }

  it('shows the last tickets called, per queue, without any name', async () => {
    expect(displayBoardSchema.parse((await board()).json())).toEqual({
      sound: true,
      register: [],
      delivery: [],
    });
    const screen = await connect(KEY);
    const called = next(screen, 'ticket.called');
    const id = await validated();
    expect((await post(`/orders/${id}/call`, cookies.cashier)).statusCode).toBe(200);
    expect(await called).toEqual({ queue: 'register', orderId: id });
    expect(displayBoardSchema.parse((await board()).json()).register).toMatchObject([
      { ticket: 'A1', station: 'REGISTER test' },
    ]);

    await post(
      `/orders/${id}/pay`,
      cookies.cashier,
      {
        version: 3,
        lines: [{ methodId: cash, amount: '6500', reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
    await post('/queues/delivery/take-next', cookies.warehouse);
    const ready = next(screen, 'ticket.called');
    expect((await post(`/orders/${id}/delivery/ready`, cookies.warehouse)).statusCode).toBe(200);
    expect(await ready).toEqual({ queue: 'delivery', orderId: id });
    const shown = await board();
    expect(displayBoardSchema.parse(shown.json()).delivery).toMatchObject([{ ticket: 'A1' }]);
    expect(shown.body).not.toContain('Rasoa');
  });

  it('opens only with the key of an active display, while the display is on', async () => {
    expect((await board('WRONG')).statusCode).toBe(404);
    await expect(connect('WRONG')).rejects.toThrow('AUTH_REQUIRED');
    const screen = await connect(KEY);
    const gone = next<string>(screen, 'disconnect');

    await displayOn(false);
    expect((await board()).statusCode).toBe(404);
    await t.app.realtime.revalidate();
    expect(await gone).toBe('io server disconnect');
  });
});
