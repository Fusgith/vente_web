import { randomUUID } from 'node:crypto';

import {
  favoritesResultSchema,
  productSearchResultSchema,
  promotionListSchema,
  promotionSchema,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopDateValue } from '../src/services/shop-time.js';
import { productId, seedDemoCatalog } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const PASSWORD = 'Boss-1234!';
const DAY = 86_400_000;
/** The shop's day, `days` from today, as `YYYY-MM-DD`. */
const shopDay = (days: number) =>
  shopDateValue(new Date(Date.now() + days * DAY))
    .toISOString()
    .slice(0, 10);

describe.skipIf(!TEST_DATABASE_URL)('products « à proposer » (RG-DEV-06 §6, H46, H49 b)', () => {
  let t: TestApp;
  let owner = '';
  let sales = '';
  let soap = '';
  let nails = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'boss', roles: ['owner'], password: PASSWORD });
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' });
    owner = (await loginOk(t.app, { username: 'boss', role: 'owner', password: PASSWORD })).cookie;
    sales = (await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })).cookie;
    soap = await productId(t.db, 'SAV-001');
    nails = await productId(t.db, 'CLO-001');
  });

  const mark = (body: unknown, cookie = owner) =>
    request(t.app, 'POST', '/api/v1/promotions', { cookie, body });
  const marked = async (body: unknown) => {
    const reply = await mark(body);
    expect(reply.statusCode, reply.body).toBe(201);
    return promotionSchema.parse(reply.json());
  };
  const withdraw = (id: string, cookie = owner) =>
    request(t.app, 'POST', `/api/v1/promotions/${id}/withdraw`, { cookie });
  const listed = async () =>
    promotionListSchema
      .parse((await request(t.app, 'GET', '/api/v1/promotions', { cookie: owner })).json())
      .items.map((promotion) => promotion.product.sku);
  const promoted = async (query = '') =>
    favoritesResultSchema.parse(
      (await request(t.app, 'GET', `/api/v1/products/favorites${query}`, { cookie: sales })).json(),
    ).promoted;

  it('lets the owner alone mark a product, with dates and an argument, audited', async () => {
    const promotion = await marked({
      productId: soap,
      startsOn: shopDay(0),
      endsOn: shopDay(6),
      pitch: '  Nouveau parfum, très demandé  ',
    });
    expect(promotion).toMatchObject({
      product: { sku: 'SAV-001' },
      startsOn: shopDay(0),
      endsOn: shopDay(6),
      pitch: 'Nouveau parfum, très demandé',
      withdrawnAt: null,
    });
    expect(await auditActions(t.db, promotion.id)).toEqual(['promotion.created']);
    expect(await listed()).toEqual(['SAV-001']);

    const body = { productId: nails, startsOn: shopDay(0), endsOn: shopDay(1) };
    expect((await mark(body, sales)).statusCode).toBe(403);
    expect((await request(t.app, 'GET', '/api/v1/promotions', { cookie: sales })).statusCode).toBe(
      403,
    );
  });

  it('shows today’s promotions on the tablet: a row beside the favorites, a mark in the search', async () => {
    await marked({ productId: soap, startsOn: shopDay(-2), endsOn: shopDay(0), pitch: 'Promo' });
    await marked({ productId: nails, startsOn: shopDay(1), endsOn: shopDay(3) });

    const row = await promoted();
    expect(row.map((hit) => [hit.sku, hit.promotion])).toEqual([['SAV-001', { pitch: 'Promo' }]]);
    expect(await promoted(`?categoryId=${randomUUID()}`)).toEqual([]);

    const search = async (q: string) =>
      productSearchResultSchema.parse(
        (await request(t.app, 'GET', `/api/v1/products/search?q=${q}`, { cookie: sales })).json(),
      ).items;
    expect((await search('SAV-001'))[0]?.promotion).toEqual({ pitch: 'Promo' });
    // Upcoming, not yet shown; the owner sees both.
    expect((await search('CLO-001'))[0]?.promotion).toBeUndefined();
    expect(await listed()).toEqual(['SAV-001', 'CLO-001']);
  });

  it('refuses wrong dates, an overlap and a product no longer on sale', async () => {
    const reverse = { productId: soap, startsOn: shopDay(3), endsOn: shopDay(1) };
    expect((await mark(reverse)).json()).toMatchObject({ code: 'PROMOTION_DATES_INVALID' });
    const past = { productId: soap, startsOn: shopDay(-5), endsOn: shopDay(-1) };
    expect((await mark(past)).json()).toMatchObject({ code: 'PROMOTION_DATES_INVALID' });

    await marked({ productId: soap, startsOn: shopDay(0), endsOn: shopDay(4) });
    const overlap = { productId: soap, startsOn: shopDay(4), endsOn: shopDay(8) };
    expect((await mark(overlap)).json()).toMatchObject({ code: 'PROMOTION_OVERLAP' });
    await marked({ productId: soap, startsOn: shopDay(5), endsOn: shopDay(8) });

    await t.db.product.update({ where: { id: nails }, data: { isActive: false } });
    const retired = { productId: nails, startsOn: shopDay(0), endsOn: shopDay(1) };
    expect((await mark(retired)).json()).toMatchObject({ code: 'PROMOTION_PRODUCT_UNAVAILABLE' });
    const unknown = { productId: randomUUID(), startsOn: shopDay(0), endsOn: shopDay(1) };
    expect((await mark(unknown)).statusCode).toBe(404);
  });

  it('withdraws a promotion: the tablet stops showing it, audited', async () => {
    const promotion = await marked({ productId: soap, startsOn: shopDay(0), endsOn: shopDay(6) });
    const reply = await withdraw(promotion.id);
    expect(reply.statusCode).toBe(200);
    expect(promotionSchema.parse(reply.json()).withdrawnAt).not.toBeNull();
    expect(await promoted()).toEqual([]);
    expect(await listed()).toEqual([]);
    expect(await auditActions(t.db, promotion.id)).toEqual([
      'promotion.created',
      'promotion.withdrawn',
    ]);

    expect((await withdraw(promotion.id)).json()).toMatchObject({ code: 'PROMOTION_NOT_CURRENT' });
    expect((await withdraw(randomUUID())).statusCode).toBe(404);
    expect((await withdraw(promotion.id, sales)).statusCode).toBe(403);
    // Its dates are free again.
    await marked({ productId: soap, startsOn: shopDay(0), endsOn: shopDay(2) });
  });
});
