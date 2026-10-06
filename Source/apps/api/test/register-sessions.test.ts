import { registerSessionSchema, registerStationSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

describe.skipIf(!TEST_DATABASE_URL)('register sessions opened (RG-CAI-01/02, H32)', () => {
  let t: TestApp;
  const cookies = { soa: '', rina: '', sales: '' };
  const stations = { one: '', two: '', counter: '' };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    await createUser(t.db, { username: 'rina', roles: ['cashier'], password: '5678' });
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' });
    cookies.soa = (
      await loginOk(t.app, { username: 'soa', role: 'cashier', password: '3456' })
    ).cookie;
    cookies.rina = (
      await loginOk(t.app, { username: 'rina', role: 'cashier', password: '5678' })
    ).cookie;
    cookies.sales = (
      await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })
    ).cookie;
    stations.one = (await createStation(t.db, 'REGISTER')).id;
    stations.two = (await createStation(t.db, 'REGISTER')).id;
    stations.counter = (await createStation(t.db, 'DELIVERY')).id;
    await createStation(t.db, 'REGISTER', false);
  });

  const open = (cookie: string, stationId: string, openingFloat = '50000') =>
    request(t.app, 'POST', '/api/v1/register-sessions', {
      cookie,
      body: { stationId, openingFloat },
    });
  const current = async (cookie: string) =>
    (await request(t.app, 'GET', '/api/v1/register-sessions/current', { cookie })).json();
  const registers = async (cookie: string) =>
    registerStationSchema
      .array()
      .parse(
        (await request(t.app, 'GET', '/api/v1/register-sessions/stations', { cookie })).json()
          .stations,
      );

  it('opens the register with its float, audited, one at a time', async () => {
    expect(await current(cookies.soa)).toEqual({ session: null });
    expect((await registers(cookies.soa)).map((station) => station.busy)).toEqual([false, false]);

    const opened = await open(cookies.soa, stations.one, '50000');
    expect(opened.statusCode, opened.body).toBe(201);
    const session = registerSessionSchema.parse(opened.json());
    expect(session).toMatchObject({ station: { id: stations.one }, openingFloat: '50000.00' });
    expect(await current(cookies.soa)).toEqual({ session });
    expect(await auditEntries(t.db)).toContainEqual(['register_session.opened', null]);

    // One open session per person, and per register.
    expect((await open(cookies.soa, stations.two)).json().code).toBe('REGISTER_SESSION_OPEN');
    expect(
      (await registers(cookies.rina)).find((station) => station.id === stations.one)?.busy,
    ).toBe(true);
    expect((await open(cookies.rina, stations.one)).json().code).toBe('REGISTER_STATION_BUSY');
    expect((await open(cookies.rina, stations.two)).statusCode).toBe(201);
  });

  it('never gives one register to two cashiers opening at once', async () => {
    const answers = await Promise.all([
      open(cookies.soa, stations.one),
      open(cookies.rina, stations.one),
    ]);
    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([201, 409]);
  });

  it('refuses a counter, an inactive register, the other roles', async () => {
    expect((await open(cookies.soa, stations.counter)).json().code).toBe('STATION_INVALID');
    expect((await open(cookies.soa, stations.one, '-5')).statusCode).toBe(400);
    expect((await open(cookies.sales, stations.one)).statusCode).toBe(403);
  });
});
