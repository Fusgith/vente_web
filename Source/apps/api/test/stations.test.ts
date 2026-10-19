import { stationPairingSchema, stationSchema, type Station } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, login, loginOk, request, type TestApp } from './helpers.js';

const STATIONS = '/api/v1/stations';
const PASSWORD = 'Shop-1234!';

describe.skipIf(!TEST_DATABASE_URL)('stations and device pairing (T-015, RG-USR-09, H71)', () => {
  let t: TestApp;
  let admin = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'admin', roles: ['admin', 'sales'], password: PASSWORD });
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: PASSWORD });
    admin = (await loginOk(t.app, { username: 'admin', password: PASSWORD })).cookie;
  });

  const create = async (type: Station['type'], name: string) =>
    stationSchema.parse(
      (await request(t.app, 'POST', STATIONS, { cookie: admin, body: { type, name } })).json(),
    );

  it('lets the admin alone declare, rename and switch off stations, audited', async () => {
    const tablet = await create('SALES', 'Tablette 1');
    expect(tablet).toMatchObject({ isActive: true, displayKey: null, pairedAt: null });

    const renamed = await request(t.app, 'PATCH', `${STATIONS}/${tablet.id}`, {
      cookie: admin,
      body: { name: 'Tablette entrée', isActive: false },
    });
    expect(renamed.json()).toMatchObject({ name: 'Tablette entrée', isActive: false });

    const list = await request(t.app, 'GET', STATIONS, { cookie: admin });
    expect(list.json().items).toHaveLength(1);
    const entries = await t.db.auditLog.findMany({
      where: { entityId: tablet.id },
      orderBy: { id: 'asc' },
      select: { action: true, before: true, after: true },
    });
    expect(entries.map((entry) => entry.action)).toEqual(['station.created', 'station.updated']);
    expect(entries[1]?.before).toMatchObject({ name: 'Tablette 1', isActive: true });

    const { cookie } = await loginOk(t.app, { username: 'vola', password: PASSWORD });
    expect((await request(t.app, 'GET', STATIONS, { cookie })).statusCode).toBe(403);
  });

  it('gives the display its address key and keeps a single active one (H29)', async () => {
    const display = await create('DISPLAY', 'Écran');
    expect(display.displayKey).toMatch(/^[\w-]{20,}$/);
    const second = await request(t.app, 'POST', STATIONS, {
      cookie: admin,
      body: { type: 'DISPLAY', name: 'Écran 2' },
    });
    expect(second.json().code).toBe('STATION_DISPLAY_EXISTS');

    const pair = await request(t.app, 'POST', `${STATIONS}/${display.id}/pair`, { cookie: admin });
    expect(pair.json().code).toBe('STATION_NOT_PAIRABLE');
  });

  it('pairs one device per station, never auditing the key', async () => {
    const tablet = await create('SALES', 'Tablette 1');
    const pair = async () =>
      stationPairingSchema.parse(
        (await request(t.app, 'POST', `${STATIONS}/${tablet.id}/pair`, { cookie: admin })).json(),
      );
    const first = await pair();
    expect(first.station.pairedAt).not.toBeNull();
    const second = await pair();

    // The new key replaces the previous one: the old device is no longer paired.
    const old = await login(t.app, { username: 'vola', password: PASSWORD, stationKey: first.key });
    expect(old.response.json().code).toBe('STATION_REQUIRED');
    const now = await loginOk(t.app, {
      username: 'vola',
      password: PASSWORD,
      stationKey: second.key,
    });
    expect(now.me.session.stationId).toBe(tablet.id);

    const audit = await t.db.auditLog.findMany({ where: { action: 'station.paired' } });
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain(second.key);
  });

  it('requires a paired device in the shop once one is, except for admin and owner', async () => {
    // Before any pairing the shop works as installed.
    await loginOk(t.app, { username: 'vola', password: PASSWORD });
    const tablet = await create('SALES', 'Tablette 1');
    await request(t.app, 'POST', `${STATIONS}/${tablet.id}/pair`, { cookie: admin });

    const unpaired = await login(t.app, { username: 'vola', password: PASSWORD });
    expect(unpaired.response.statusCode).toBe(400);
    expect(unpaired.response.json().code).toBe('STATION_REQUIRED');

    // The admin still opens the admin role, but not the work of a station.
    const { cookie, me } = await loginOk(t.app, { username: 'admin', password: PASSWORD });
    expect(me.session.activeRole).toBe('admin');
    const sales = await request(t.app, 'POST', '/api/v1/auth/switch-role', {
      cookie,
      body: { role: 'sales' },
    });
    expect(sales.json().code).toBe('STATION_REQUIRED');

    // Switching the paired station off lifts the requirement.
    // (This new login replaced the admin's first session: its cookie is the current one.)
    await request(t.app, 'PATCH', `${STATIONS}/${tablet.id}`, {
      cookie,
      body: { isActive: false },
    });
    await loginOk(t.app, { username: 'vola', password: PASSWORD });
  });
});
