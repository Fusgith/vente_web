import { auditPageSchema, type AuditPage } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopDayStart } from '../src/services/shop-time.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

const HOUR = 3_600_000;

describe.skipIf(!TEST_DATABASE_URL)('the audit log, read only (T-014, RG-AUD-01)', () => {
  let t: TestApp;
  const cookies = { manager: '', owner: '', admin: '', sales: '', cashier: '', warehouse: '' };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    for (const [role, username] of [
      ['manager', 'chef'],
      ['owner', 'boss'],
      ['admin', 'adm'],
      ['sales', 'vola'],
      ['cashier', 'soa'],
      ['warehouse', 'feno'],
    ] as const) {
      await createUser(t.db, { username, roles: [role], password: 'Mot-de-passe-1' });
      cookies[role] = (await loginOk(t.app, { username, role, password: 'Mot-de-passe-1' })).cookie;
    }
  });

  const read = (query: string, cookie = cookies.manager) =>
    request(t.app, 'GET', `/api/v1/audit${query}`, { cookie });
  const page = async (query = '', cookie = cookies.manager): Promise<AuditPage> => {
    const response = await read(query, cookie);
    expect(response.statusCode).toBe(200);
    return auditPageSchema.parse(response.json());
  };

  it('opens to the manager, the owner and the admin only (annexe B)', async () => {
    for (const role of ['manager', 'owner', 'admin'] as const) {
      expect((await read('', cookies[role])).statusCode).toBe(200);
    }
    for (const role of ['sales', 'cashier', 'warehouse'] as const) {
      expect((await read('', cookies[role])).statusCode).toBe(403);
    }
    expect((await request(t.app, 'GET', '/api/v1/audit')).statusCode).toBe(401);
  });

  it('tells who did what today, the latest first', async () => {
    const { entries, more } = await page();
    expect(more).toBe(false);
    const logins = entries.filter((entry) => entry.action === 'auth.login');
    expect(logins.map((entry) => entry.user?.username)).toEqual([
      'feno',
      'soa',
      'vola',
      'adm',
      'boss',
      'chef',
    ]);
    expect(logins[0]).toMatchObject({
      user: { username: 'feno', fullName: 'User feno' },
      activeRole: 'warehouse',
      origin: 'LAN',
      entityType: 'session',
    });
    const times = entries.map((entry) => entry.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('narrows to a subject, to who acted, to another day', async () => {
    const vola = await t.db.user.findUniqueOrThrow({ where: { username: 'vola' } });
    const yesterday = new Date(shopDayStart(new Date()).getTime() - 2 * HOUR);
    await t.db.auditLog.create({
      data: {
        at: yesterday,
        userId: vola.id,
        action: 'customer.created',
        entityType: 'customer',
        entityId: 'c-1',
        after: { name: 'Rasoa' },
      },
    });

    const sessions = await page('?subject=sessions');
    expect(sessions.entries.length).toBeGreaterThan(0);
    expect(sessions.entries.every((entry) => entry.entityType === 'session')).toBe(true);

    const volas = await page('?user=VOLA');
    expect(volas.entries.length).toBeGreaterThan(0);
    expect(volas.entries.every((entry) => entry.user?.username === 'vola')).toBe(true);

    expect((await page('?subject=customers')).entries).toEqual([]);
    const day = new Date(yesterday.getTime() + 3 * HOUR).toISOString().slice(0, 10);
    const before = await page(`?day=${day}&subject=customers`);
    expect(before.entries).toHaveLength(1);
    expect(before.entries[0]).toMatchObject({
      action: 'customer.created',
      after: { name: 'Rasoa' },
      user: { username: 'vola' },
    });
  });

  it('pages a busy day by 100, without losing or repeating an entry', async () => {
    const start = shopDayStart(new Date()).getTime() + HOUR;
    await t.db.auditLog.createMany({
      data: Array.from({ length: 105 }, (_, n) => ({
        at: new Date(start + n * 1000),
        action: 'stock.adjust',
        entityType: 'product',
        entityId: `p-${n}`,
      })),
    });
    const first = await page('?subject=stock');
    expect(first.entries).toHaveLength(100);
    expect(first.more).toBe(true);
    const last = first.entries.at(-1)?.id ?? '';
    const second = await page(`?subject=stock&before=${last}`);
    expect(second.more).toBe(false);
    const ids = [...first.entries, ...second.entries].map((entry) => entry.entityId);
    expect(ids).toEqual(Array.from({ length: 105 }, (_, n) => `p-${104 - n}`));
  });

  it('refuses a filter it does not know', async () => {
    expect((await read('?subject=everything')).statusCode).toBe(400);
    expect((await read('?day=06/10/2026')).statusCode).toBe(400);
  });

  it('keeps every entry as written: no change, no deletion (RG-AUD-01)', async () => {
    const entry = await t.db.auditLog.findFirstOrThrow();
    await expect(
      t.db.auditLog.update({ where: { id: entry.id }, data: { reason: 'changed' } }),
    ).rejects.toThrow(/append-only/);
    await expect(t.db.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
