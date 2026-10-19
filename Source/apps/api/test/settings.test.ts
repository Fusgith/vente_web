import { settingsSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { readSetting } from '../src/services/settings.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const ADMIN_PASSWORD = 'Admin-1234!';

describe.skipIf(!TEST_DATABASE_URL)('the « Paramètres » screen (CDC métier §13, T-013)', () => {
  let t: TestApp;
  let admin = '';
  let manager = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'admin', roles: ['admin'], password: ADMIN_PASSWORD });
    await createUser(t.db, { username: 'resp', roles: ['manager'], password: '1234' });
    admin = (await loginOk(t.app, { username: 'admin', role: 'admin', password: ADMIN_PASSWORD }))
      .cookie;
    manager = (await loginOk(t.app, { username: 'resp', role: 'manager', password: '1234' }))
      .cookie;
  });

  const put = (cookie: string, key: string, value: unknown) =>
    request(t.app, 'PUT', `/api/v1/settings/${key}`, { cookie, body: { value } });

  it('is set by the admin, checked, audited once per change, read at once', async () => {
    const reply = await put(admin, 'vat_rate', 18);
    expect(reply.statusCode, reply.body).toBe(200);
    expect(settingsSchema.parse(reply.json()).values.vat_rate).toBe(18);
    expect(await readSetting(t.db, 'vat_rate')).toBe(18);
    expect((await put(admin, 'vat_rate', 18)).statusCode).toBe(200);
    expect(await auditActions(t.db, 'vat_rate')).toEqual(['setting.update']);

    expect((await put(admin, 'vat_rate', 120)).statusCode).toBe(400);
    expect((await put(admin, 'invoice_prefix', 'fa')).statusCode).toBe(400);
    expect((await put(admin, 'currency', 'EUR')).statusCode).toBe(400);
    expect((await put(manager, 'vat_rate', 5)).statusCode).toBe(403);

    const read = await request(t.app, 'GET', '/api/v1/settings', { cookie: manager });
    expect(read.statusCode).toBe(200);
    const { values } = settingsSchema.parse(read.json());
    expect(values.vat_rate).toBe(18);
    expect(values.quote_prefix).toBeNull();
  });
});
