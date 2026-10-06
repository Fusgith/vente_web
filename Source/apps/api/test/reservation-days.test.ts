import {
  customerSchema,
  queueSchema,
  quoteSchema,
  reservationDaysResultSchema,
  type Role,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
import { shopDateValue } from '../src/services/shop-time.js';
import { seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const DAY = 86_400_000;
const OWNER_PASSWORD = 'Boss-1234!';

describe.skipIf(!TEST_DATABASE_URL)('reservation duration (RG-STK-02, RG-CMD-08, H45)', () => {
  let t: TestApp;
  const cookies = { owner: '', admin: '', manager: '', sales: '', cashier: '' };
  const ids = { rasoa: '', tsara: '', nailsUnit: '' };
  let published: Emission[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'boss', roles: ['owner'], password: OWNER_PASSWORD });
    await createUser(t.db, { username: 'admin', roles: ['admin'], password: OWNER_PASSWORD });
    await createUser(t.db, { username: 'rakoto', roles: ['manager'], password: '2345' });
    await createUser(t.db, {
      username: 'vola',
      roles: ['sales'],
      password: '1234',
      ticketLetter: 'A',
    });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    const as = async (username: string, role: Role, password: string) =>
      (await loginOk(t.app, { username, role, password })).cookie;
    cookies.owner = await as('boss', 'owner', OWNER_PASSWORD);
    cookies.admin = await as('admin', 'admin', OWNER_PASSWORD);
    cookies.manager = await as('rakoto', 'manager', '2345');
    cookies.sales = await as('vola', 'sales', '1234');
    cookies.cashier = await as('soa', 'cashier', '3456');
    const customer = async (name: string, phone: string) =>
      customerSchema.parse(
        (await send('POST', '/customers', cookies.sales, { name, phone })).json(),
      ).id;
    ids.rasoa = await customer('Rasoa Hanta', '034 11 222 33');
    ids.tsara = await customer('Épicerie Tsara Be', '032 11 222 33');
    ids.nailsUnit = await unitId(t.db, 'CLO-001', 'kg');
    published = [];
    vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
      published.push(...emissions);
    });
  });

  const send = (method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, body?: unknown) =>
    request(t.app, method, `/api/v1${url}`, { cookie, ...(body ? { body } : {}) });
  const durations = async (cookie = cookies.owner) => {
    const reply = await send('GET', '/reservation-days', cookie);
    expect(reply.statusCode, reply.body).toBe(200);
    return reservationDaysResultSchema.parse(reply.json());
  };

  /** An order of 2 kg of nails for this customer, validated: its id and deadline. */
  async function validated(customerId: string): Promise<{ id: string; expiresAt: number }> {
    const quote = await send('POST', '/quotes', cookies.sales, {
      customerId,
      lines: [{ productUnitId: ids.nailsUnit, qty: '2', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    const submit = await send('POST', `/orders/${id}/submit`, cookies.sales, { version: 1 });
    expect(submit.statusCode, submit.body).toBe(200);
    const order = await t.db.order.findUniqueOrThrow({ where: { id } });
    return { id, expiresAt: order.expiresAt?.getTime() ?? Number.NaN };
  }

  it('is the day itself until set; the admin and the owner set it, audited', async () => {
    expect(await durations()).toEqual({ days: 0, customers: [] });
    expect((await durations(cookies.manager)).days).toBe(0);
    expect((await send('GET', '/reservation-days', cookies.sales)).statusCode).toBe(403);
    expect((await send('PUT', '/reservation-days', cookies.manager, { days: 2 })).statusCode).toBe(
      403,
    );

    const set = await send('PUT', '/reservation-days', cookies.owner, { days: 2 });
    expect(set.statusCode, set.body).toBe(200);
    expect(reservationDaysResultSchema.parse(set.json()).days).toBe(2);
    expect((await send('PUT', '/reservation-days', cookies.admin, { days: 3 })).statusCode).toBe(
      200,
    );
    // The same value again changes nothing, and leaves no trace.
    await send('PUT', '/reservation-days', cookies.admin, { days: 3 });
    const entries = await t.db.auditLog.findMany({
      where: { action: 'reservation_days.set' },
      orderBy: { id: 'asc' },
    });
    expect(entries.map(({ before, after }) => [before, after])).toEqual([
      [{ days: 0 }, { days: 2 }],
      [{ days: 2 }, { days: 3 }],
    ]);
    for (const days of [-1, 366, 1.5]) {
      const bad = await send('PUT', '/reservation-days', cookies.owner, { days });
      expect([bad.statusCode, bad.json().code]).toEqual([400, 'VALIDATION_ERROR']);
    }
  });

  it('gives a customer their own duration, listed until given the general one back', async () => {
    const put = (id: string, days: number | null, cookie = cookies.admin) =>
      send('PUT', `/customers/${id}/reservation-days`, cookie, { days });
    expect((await put(ids.rasoa, 5)).statusCode).toBe(200);
    expect((await put(ids.rasoa, 5, cookies.manager)).statusCode).toBe(403);
    expect(await durations()).toEqual({
      days: 0,
      customers: [{ id: ids.rasoa, name: 'Rasoa Hanta', phone: '0341122233', days: 5 }],
    });

    expect((await put(ids.rasoa, null, cookies.owner)).statusCode).toBe(200);
    expect((await durations()).customers).toEqual([]);
    expect(await auditActions(t.db, ids.rasoa)).toEqual([
      'customer.created',
      'reservation_days.set',
      'reservation_days.set',
    ]);

    const unknown = await put('01a0c606-0000-7000-8000-000000000000', 1);
    expect([unknown.statusCode, unknown.json().code]).toEqual([404, 'NOT_FOUND']);
    await t.db.customer.update({ where: { id: ids.tsara }, data: { isActive: false } });
    const inactive = await put(ids.tsara, 1);
    expect([inactive.statusCode, inactive.json().code]).toEqual([409, 'CUSTOMER_INACTIVE']);
  });

  it("keeps an order to the end of its last day, the customer's own duration first", async () => {
    const sameDay = await validated(ids.tsara);
    await send('PUT', '/reservation-days', cookies.owner, { days: 1 });
    const general = await validated(ids.tsara);
    await send('PUT', `/customers/${ids.rasoa}/reservation-days`, cookies.owner, { days: 3 });
    const own = await validated(ids.rasoa);
    // No daylight saving in Antananarivo: whole days apart, from the same day end.
    expect(general.expiresAt - sameDay.expiresAt).toBe(DAY);
    expect(own.expiresAt - sameDay.expiresAt).toBe(3 * DAY);
    const reservations = await t.db.reservation.findMany({ where: { orderId: own.id } });
    expect(reservations.map((r) => r.expiresAt?.getTime())).toEqual([own.expiresAt]);
  });

  it('gives an order kept from a former day a ticket of the day, at the same place', async () => {
    await send('PUT', '/reservation-days', cookies.owner, { days: 2 });
    const kept = await validated(ids.rasoa);
    const today = await validated(ids.tsara);
    const day = shopDateValue(new Date());
    const yesterday = new Date(day.getTime() - DAY);
    await t.db.order.update({ where: { id: kept.id }, data: { ticketDate: yesterday } });
    published = [];

    expect(await t.app.expiry.sweep()).toEqual([]);

    const renewed = await t.db.order.findUniqueOrThrow({ where: { id: kept.id } });
    expect(renewed).toMatchObject({ status: 'SUBMITTED', ticketLetter: 'A', ticketSeq: 3 });
    expect(renewed.ticketDate?.getTime()).toBe(day.getTime());
    const queue = queueSchema.parse(
      (await send('GET', '/queues/register', cookies.cashier)).json(),
    );
    expect(queue.waiting.map((item) => [item.orderId, item.ticket.seq])).toEqual([
      [kept.id, 3],
      [today.id, 2],
    ]);
    const audit = await t.db.auditLog.findFirstOrThrow({
      where: { action: 'order.ticket_renewed' },
    });
    expect(audit).toMatchObject({
      userId: null,
      entityId: kept.id,
      before: { ticket: { letter: 'A', seq: 1, date: yesterday.toISOString().slice(0, 10) } },
      after: { ticket: { letter: 'A', seq: 3, date: day.toISOString().slice(0, 10) } },
    });
    expect(published).toContainEqual({
      rooms: ['queue:register'],
      event: 'queue.changed',
      payload: { queue: 'register', orderId: kept.id, change: 'updated' },
    });
    // Done once a day.
    expect(await t.app.expiry.sweep()).toEqual([]);
    expect(await auditActions(t.db, kept.id)).toContain('order.ticket_renewed');
    expect(
      (await t.db.auditLog.findMany({ where: { action: 'order.ticket_renewed' } })).length,
    ).toBe(1);
  });
});
