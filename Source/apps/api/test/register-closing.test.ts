import { randomUUID } from 'node:crypto';

import {
  customerSchema,
  quoteSchema,
  sessionSummaryListSchema,
  sessionSummarySchema,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditEntries,
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('register closing (RG-CAI-03 à 05, H35)', () => {
  let t: TestApp;
  const cookies = { sales: '', soa: '', rina: '', manager: '', owner: '' };
  const ids = { customer: '', nails: '', register: '' };
  let methods: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    methods = await seedPaymentMethods(t.db);
    await createUser(t.db, {
      username: 'vola',
      roles: ['sales'],
      password: '1234',
      ticketLetter: 'A',
    });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    await createUser(t.db, { username: 'rina', roles: ['cashier'], password: '5678' });
    for (const [key, username, role, password] of [
      ['sales', 'vola', 'sales', '1234'],
      ['soa', 'soa', 'cashier', '3456'],
      ['rina', 'rina', 'cashier', '5678'],
      ['manager', 'responsable', 'manager', '1234'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
    const customer = await post('/customers', cookies.sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.nails = await unitId(t.db, 'CLO-001', 'kg');
    ids.register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.soa, {
      stationId: ids.register,
      openingFloat: '50000',
    });
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }
  const get = (url: string, cookie: string) => request(t.app, 'GET', `/api/v1${url}`, { cookie });

  /** 1 kg of nails (6 500,00 MGA) validated and called to Soa's register. */
  async function called(): Promise<string> {
    const quote = await post('/quotes', cookies.sales, {
      customerId: ids.customer,
      lines: [{ productUnitId: ids.nails, qty: '1', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    await post(`/orders/${id}/call`, cookies.soa);
    return id;
  }
  async function paid(line: object, cashReceived: string | null) {
    const id = await called();
    const response = await post(
      `/orders/${id}/pay`,
      cookies.soa,
      { version: 3, lines: [line], cashReceived },
      randomUUID(),
    );
    expect(response.statusCode, response.body).toBe(200);
  }
  const summary = async () =>
    sessionSummarySchema
      .nullable()
      .parse((await get('/register-sessions/current/summary', cookies.soa)).json().summary);
  const close = (body: object) => post('/register-sessions/current/close', cookies.soa, body);

  it('adds up the takings by method; the drawer holds the float and the cash part', async () => {
    await paid({ methodId: methods['CASH'], amount: '6500', reference: null }, '10000');
    await paid({ methodId: methods['MVOLA'], amount: '6500', reference: 'MP1' }, null);
    expect(await summary()).toMatchObject({
      openingFloat: '50000.00',
      byMethod: [
        { code: 'CASH', label: 'Espèces', count: 1, total: '6500.00' },
        { code: 'MVOLA', label: 'MVola', count: 1, total: '6500.00' },
      ],
      // 50 000 + 6 500: the 3 500 of change went back to the customer.
      cashExpected: '56500.00',
      closedAt: null,
      forgotten: false,
    });
  });

  it('closes with the cash counted, a comment required on a variance, then for good', async () => {
    await paid({ methodId: methods['CASH'], amount: '6500', reference: null }, null);
    // Nobody left at the register.
    await called();
    expect((await close({ countedCash: '56500', note: null })).json().code).toBe('REGISTER_BUSY');
    await t.db.order.updateMany({
      where: { status: 'AT_REGISTER' },
      data: { status: 'CANCELLED' },
    });

    expect((await close({ countedCash: '56000', note: '  ' })).json().code).toBe(
      'REGISTER_SESSION_NOTE_REQUIRED',
    );
    const closed = await close({ countedCash: '56000', note: 'Billet de 500 manquant' });
    expect(closed.statusCode, closed.body).toBe(200);
    expect(sessionSummarySchema.parse(closed.json())).toMatchObject({
      cashExpected: '56500.00',
      countedCash: '56000.00',
      variance: '-500.00',
      note: 'Billet de 500 manquant',
    });
    const row = await t.db.registerSession.findFirstOrThrow();
    expect(row.closedAt).not.toBeNull();
    expect(row.expectedByMethod).toMatchObject({ cashExpected: '56500.00' });
    expect(await auditEntries(t.db)).toContainEqual([
      'register_session.closed',
      'Billet de 500 manquant',
    ]);

    // Closed for good: nothing left to close, nothing to take; a new session may open.
    expect(await summary()).toBeNull();
    expect((await close({ countedCash: '0', note: null })).json().code).toBe(
      'REGISTER_SESSION_REQUIRED',
    );
    const reopened = await post('/register-sessions', cookies.soa, {
      stationId: ids.register,
      openingFloat: '20000',
    });
    expect(reopened.statusCode).toBe(201);
  });

  it('closes without a comment when the cash is right', async () => {
    const response = await close({ countedCash: '50000', note: null });
    expect(sessionSummarySchema.parse(response.json())).toMatchObject({ variance: '0.00' });
  });

  it('shows the day to the manager, a forgotten session flagged (RG-CAI-05)', async () => {
    const other = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.rina, { stationId: other, openingFloat: '0' });
    // Rina's session was opened yesterday and never closed.
    await t.db.registerSession.updateMany({
      where: { stationId: other },
      data: { openedAt: new Date(Date.now() - 30 * 3_600_000) },
    });
    const list = await get('/register-sessions', cookies.manager);
    expect(list.statusCode, list.body).toBe(200);
    const { sessions } = sessionSummaryListSchema.parse(list.json());
    expect(sessions.map((session) => [session.cashier.fullName, session.forgotten])).toEqual([
      ['User rina', true],
      ['User soa', false],
    ]);
    expect((await get('/register-sessions', cookies.soa)).statusCode).toBe(403);
    // Another day shows only what was opened then.
    const past = await get('/register-sessions?day=2020-01-01', cookies.manager);
    expect(sessionSummaryListSchema.parse(past.json()).sessions).toEqual([]);
  });

  it('gives the closing report to its cashier, the manager, never another cashier', async () => {
    await paid({ methodId: methods['CASH'], amount: '6500', reference: null }, null);
    await close({ countedCash: '56500', note: null });
    const { id } = await t.db.registerSession.findFirstOrThrow({ select: { id: true } });
    const report = await get(`/register-sessions/${id}/report`, cookies.soa);
    expect(report.statusCode).toBe(200);
    expect(report.headers['content-type']).toBe('application/pdf');
    expect(report.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await get(`/register-sessions/${id}/report`, cookies.manager)).statusCode).toBe(200);
    expect((await get(`/register-sessions/${id}/report`, cookies.rina)).statusCode).toBe(403);
  });
});
