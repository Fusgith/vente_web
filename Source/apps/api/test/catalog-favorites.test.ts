import { categoriesResultSchema, favoritesResultSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { recordSale, seedDemoCatalog } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('favorites and categories of the search (RG-DEV-06 §5)', () => {
  let t: TestApp;
  let cookie: string;
  let vola: string;
  let hery: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    vola = (await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234' })).id;
    hery = (await createUser(t.db, { username: 'hery', roles: ['sales'], pin: '1234' })).id;
    ({ cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' }));
  });

  async function favorites(extra = ''): Promise<string[]> {
    const response = await request(t.app, 'GET', `/api/v1/products/favorites${extra}`, { cookie });
    expect(response.statusCode, response.body).toBe(200);
    return favoritesResultSchema.parse(response.json()).items.map((item) => item.sku);
  }

  async function sell(salesUserId: string, sku: string, times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      await recordSale(t.db, { salesUserId, status: 'PAID', skus: [sku] });
    }
  }

  it('needs a session', async () => {
    expect((await request(t.app, 'GET', '/api/v1/products/favorites')).statusCode).toBe(401);
    expect((await request(t.app, 'GET', '/api/v1/categories')).statusCode).toBe(401);
  });

  it('is empty before any sale', async () => {
    expect(await favorites()).toEqual([]);
  });

  it("puts the salesperson's best sellers first, then the shop's", async () => {
    await sell(vola, 'SAV-001', 3);
    await sell(vola, 'RIZ-001', 1);
    await sell(hery, 'EAU-001', 5);
    await sell(hery, 'HUI-001', 2);
    await sell(hery, 'SAV-001', 1);
    expect(await favorites()).toEqual(['SAV-001', 'RIZ-001', 'EAU-001', 'HUI-001']);
  });

  it('counts orders, not lines, of the last 30 days, validated and not cancelled', async () => {
    await recordSale(t.db, {
      salesUserId: vola,
      status: 'SUBMITTED',
      skus: ['SUC-001', 'FIL-001'],
    });
    await recordSale(t.db, { salesUserId: vola, status: 'CANCELLED', skus: ['CLO-001'] });
    await recordSale(t.db, { salesUserId: vola, status: 'DRAFT', skus: ['CLO-001'] });
    await recordSale(t.db, { salesUserId: vola, status: 'PAID', daysAgo: 40, skus: ['CLO-001'] });
    expect(await favorites()).toEqual(['FIL-001', 'SUC-001']);
  });

  it('filters on a category and skips inactive products', async () => {
    await sell(vola, 'EAU-001', 2);
    await sell(vola, 'SAV-001', 3);
    await sell(vola, 'HUI-001', 1);
    const drinks = await t.db.category.findUniqueOrThrow({ where: { name: 'Boissons' } });
    expect(await favorites(`?categoryId=${drinks.id}`)).toEqual(['EAU-001']);

    await t.db.product.update({ where: { sku: 'SAV-001' }, data: { isActive: false } });
    expect(await favorites()).toEqual(['EAU-001', 'HUI-001']);
  });

  it('keeps at most 12 favorites', async () => {
    const skus = await t.db.product.findMany({ select: { sku: true } });
    for (let i = 0; i < 4; i += 1) {
      await t.db.product.create({
        data: { sku: `NEW-00${i}`, name: `Nouveau ${i}`, baseUnit: 'pièce' },
      });
    }
    const all = [...skus.map((row) => row.sku), 'NEW-000', 'NEW-001', 'NEW-002', 'NEW-003'];
    // Units are needed for the sale lines of the new products.
    for (const sku of all.slice(-4)) {
      await t.db.productUnit.create({
        data: { product: { connect: { sku } }, label: 'pièce', factor: 1, isBase: true },
      });
    }
    await recordSale(t.db, { salesUserId: hery, status: 'PAID', skus: all });
    expect(await favorites()).toHaveLength(12);
  });

  it('lists the active categories by name', async () => {
    await t.db.category.update({ where: { name: 'Quincaillerie' }, data: { isActive: false } });
    const response = await request(t.app, 'GET', '/api/v1/categories', { cookie });
    expect(response.statusCode).toBe(200);
    const names = categoriesResultSchema.parse(response.json()).items.map((item) => item.name);
    expect(names).toEqual(['Alimentation', 'Boissons', 'Savons et hygiène']);
  });
});
