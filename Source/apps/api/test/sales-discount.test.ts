import { salesDiscountSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearSettingsCache } from '../src/services/settings.js';
import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const KEY = 'sales_discount_enabled';
const ADMIN_PASSWORD = 'Admin-1234!';
const FIVE_PCT = { kind: 'pct', value: '5' };

describe.skipIf(!TEST_DATABASE_URL)('the salesperson’s discounts, set by the admin (H60)', () => {
  let t: TestApp;
  let s: DiscountScene;
  let admin = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    s = await discountScene(t);
    await createUser(t.db, { username: 'admin', roles: ['admin'], password: ADMIN_PASSWORD });
    admin = (await loginOk(t.app, { username: 'admin', role: 'admin', password: ADMIN_PASSWORD }))
      .cookie;
  });

  const read = async (cookie: string) => {
    const reply = await request(t.app, 'GET', '/api/v1/sales-discount', { cookie });
    expect(reply.statusCode, reply.body).toBe(200);
    return salesDiscountSchema.parse(reply.json()).enabled;
  };
  const set = (cookie: string, enabled: boolean) =>
    request(t.app, 'PUT', '/api/v1/sales-discount', { cookie, body: { enabled } });
  const turnOff = async () => expect((await set(admin, false)).statusCode).toBe(200);

  it('is off until the admin turns it on, and everyone reads it', async () => {
    await t.db.setting.delete({ where: { key: KEY } });
    clearSettingsCache();
    expect(await read(s.cookies.sales)).toBe(false);
    expect(await read(s.cookies.cashier)).toBe(false);
    const reply = await set(admin, true);
    expect(reply.statusCode, reply.body).toBe(200);
    expect(salesDiscountSchema.parse(reply.json()).enabled).toBe(true);
    expect(await read(s.cookies.sales)).toBe(true);
  });

  it('is set by the admin alone, audited once per change', async () => {
    for (const cookie of [s.cookies.owner, s.cookies.manager, s.cookies.sales]) {
      expect((await set(cookie, false)).statusCode).toBe(403);
    }
    await turnOff();
    await turnOff();
    expect(await auditActions(t.db, KEY)).toEqual(['sales_discount.set']);
    const row = await t.db.auditLog.findFirstOrThrow({ where: { entityId: KEY } });
    expect([row.before, row.after]).toEqual([{ enabled: true }, { enabled: false }]);
    expect((await set(admin, 'yes' as unknown as boolean)).statusCode).toBe(400);
  });

  it('turned off, refuses the salesperson’s discounts but not a quote without any', async () => {
    await turnOff();
    const save = (discount: unknown) => ({
      customerId: s.ids.customer,
      lines: [{ productUnitId: s.units.soapPack, qty: '4', discount }],
      orderDiscount: null,
    });
    const refused = await s.post('/quotes', s.cookies.sales, save(FIVE_PCT));
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: 'SALES_DISCOUNT_DISABLED' });
    const total = await s.post('/quotes', s.cookies.sales, {
      ...save(null),
      orderDiscount: { kind: 'amount', value: '1000' },
    });
    expect(total.statusCode).toBe(403);

    const quote = await s.quote();
    const edit = (cookie: string) =>
      request(t.app, 'PUT', `/api/v1/quotes/${quote.id}`, {
        cookie,
        body: { ...save(FIVE_PCT), version: quote.version },
      });
    expect((await edit(s.cookies.sales)).statusCode).toBe(403);
    // The manager keeps discounting (annexe B): only the salesperson is concerned.
    expect((await edit(s.cookies.manager)).statusCode).toBe(200);
  });

  it('turned off, the salesperson does not ask the owner; the cashier asks', async () => {
    const quote = await s.quote();
    await turnOff();
    expect((await s.ask(quote, [[s.products.soap, 'pct', '10']])).statusCode).toBe(403);

    const order = await s.atRegister();
    const reply = await s.ask(order, [[s.products.soap, 'pct', '10']], s.cookies.cashier);
    expect(reply.statusCode, reply.body).toBe(201);
  });
});
