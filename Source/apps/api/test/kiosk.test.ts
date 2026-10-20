import {
  kioskBasketListSchema,
  kioskHomeSchema,
  kioskSearchResultSchema,
  quoteSchema,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearSettingsCache } from '../src/services/settings.js';
import { seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

const KEY = 'BORNE-TEST-1';

describe.skipIf(!TEST_DATABASE_URL)('self-service kiosk (T-036, RG-BOR-01 à 06)', () => {
  let t: TestApp;
  let sales = '';
  let other = '';
  const units = { soapPack: '', nails: '' };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' });
    await createUser(t.db, { username: 'naina', roles: ['sales'], password: '1234' });
    sales = (await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })).cookie;
    other = (await loginOk(t.app, { username: 'naina', role: 'sales', password: '1234' })).cookie;
    await t.db.station.create({ data: { type: 'KIOSK', name: 'Borne entrée', displayKey: KEY } });
    units.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
    units.nails = await unitId(t.db, 'CLO-001', 'kg');
  });

  const basket = (phone = '034 11 222 33') => ({
    name: 'Rasoa Hanta',
    phone,
    lines: [
      { productUnitId: units.soapPack, qty: '2' },
      { productUnitId: units.nails, qty: '3' },
    ],
  });
  const send = (body: unknown, key = KEY) =>
    request(t.app, 'POST', `/api/v1/kiosk/${key}/baskets`, { body });
  const pending = async () =>
    kioskBasketListSchema.parse(
      (await request(t.app, 'GET', '/api/v1/kiosk-baskets', { cookie: sales })).json(),
    ).items;
  const take = (id: string, cookie = sales) =>
    request(t.app, 'POST', `/api/v1/kiosk-baskets/${id}/take`, { cookie });

  it('opens by its key without an account, showing neither stock figure nor cap', async () => {
    const home = await request(t.app, 'GET', `/api/v1/kiosk/${KEY}`);
    expect(home.statusCode).toBe(200);
    expect(kioskHomeSchema.parse(home.json())).toMatchObject({
      station: 'Borne entrée',
      idleSeconds: 120,
    });
    const search = await request(t.app, 'GET', `/api/v1/kiosk/${KEY}/search?q=savon`);
    const result = kioskSearchResultSchema.parse(search.json());
    expect(result.items.map((item) => item.name).join()).toMatch(/savon/i);
    expect(search.body).not.toMatch(/available|maxDiscountPct|capPct/);
    expect((await request(t.app, 'GET', '/api/v1/kiosk/INCONNUE')).statusCode).toBe(404);
  });

  it('numbers the baskets of the day and lists them pending at base price', async () => {
    const first = await send(basket());
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ basket: 'P1' });
    expect((await send(basket('034 99 888 77'))).json()).toEqual({ basket: 'P2' });
    const list = await pending();
    expect(list.map((item) => [item.basket, item.name, item.lineCount])).toEqual([
      ['P1', 'Rasoa Hanta', 2],
      ['P2', 'Rasoa Hanta', 2],
    ]);
    expect(list[0]?.total).toBe('69500.00');
    // Nobody is created before a salesperson takes the basket (RG-BOR-03).
    expect(await t.db.customer.count()).toBe(0);
  });

  it('becomes a quote in the name of the salesperson who takes it, once', async () => {
    await send(basket());
    const [item] = await pending();
    const taken = await take(item!.id);
    expect(taken.statusCode).toBe(200);
    const quote = quoteSchema.parse(
      (
        await request(t.app, 'GET', `/api/v1/quotes/${taken.json().quoteId}`, { cookie: sales })
      ).json(),
    );
    expect(quote.customer.name).toBe('Rasoa Hanta');
    expect(quote.total).toBe('69500.00');
    expect(await pending()).toEqual([]);
    const again = await take(item!.id, other);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('KIOSK_BASKET_TAKEN');
  });

  it('takes up the known customer of the phone instead of a duplicate', async () => {
    await send(basket());
    await take((await pending())[0]!.id);
    await send({ ...basket(), name: 'Autre nom' });
    await take((await pending())[0]!.id);
    expect(await t.db.customer.count()).toBe(1);
  });

  it('refuses baskets beyond the hourly limit of the kiosk (RG-BOR-06)', async () => {
    await t.db.setting.create({ data: { key: 'kiosk.max_baskets_per_hour', value: 1 } });
    clearSettingsCache();
    expect((await send(basket())).statusCode).toBe(201);
    const refused = await send(basket());
    expect(refused.statusCode).toBe(429);
    expect(refused.json().code).toBe('KIOSK_BUSY');
  });
});
