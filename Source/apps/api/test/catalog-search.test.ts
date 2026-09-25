import { productSearchResultSchema, type ProductSearchResult, type Role } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { productId, seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

const SEARCH = '/api/v1/products/search';

describe.skipIf(!TEST_DATABASE_URL)('GET /api/v1/products/search (RG-DEV-06)', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'vola', roles: ['sales', 'warehouse'], pin: '1234' });
    ({ cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' }));
  });

  async function search(q: string, extra = '', as = cookie): Promise<ProductSearchResult> {
    const url = `${SEARCH}?q=${encodeURIComponent(q)}${extra}`;
    const response = await request(t.app, 'GET', url, { cookie: as });
    expect(response.statusCode, response.body).toBe(200);
    return productSearchResultSchema.parse(response.json());
  }
  const skus = (result: ProductSearchResult) => result.items.map((item) => item.sku);

  it('needs a session', async () => {
    const response = await request(t.app, 'GET', `${SEARCH}?q=riz`);
    expect(response.statusCode).toBe(401);
  });

  it('matches word prefixes in any order, ignoring case and accents, unit labels included', async () => {
    expect(skus(await search('riz 50'))).toEqual(['RIZ-001']);
    expect(skus(await search('50 RIZ'))).toEqual(['RIZ-001']);
    expect(skus(await search('VÉGÉT'))).toEqual(['HUI-001']);
    expect(skus(await search('huile vegetale'))).toEqual(['HUI-001']);
    // A prefix of a word, never the middle of one.
    expect(skus(await search('arseille'))).toEqual([]);
  });

  it('ranks the code prefix before designations (exact, prefix, then name)', async () => {
    const soap = await t.db.product.create({
      data: { sku: 'SHP-001', name: 'Savonnette parfumée', baseUnit: 'pièce' },
    });
    expect(soap.searchText).toBe(' shp 001 savonnette parfumee');

    expect(skus(await search('sav'))).toEqual(['SAV-001', 'SAV-002', 'SHP-001']);
    const exact = await search('sav-002');
    expect(skus(exact)[0]).toBe('SAV-002');
  });

  it('shows at most 8 results and asks to refine beyond', async () => {
    await t.db.product.create({ data: { sku: 'SHP-001', name: 'Shampooing', baseUnit: 'pièce' } });
    const result = await search('001');
    expect(result.items).toHaveLength(8);
    expect(result.more).toBe(true);
    expect((await search('sav')).more).toBe(false);
  });

  it('adds a scanned barcode directly, in the unit of the barcode', async () => {
    const result = await search('3760000000024');
    expect(result.exact).toEqual({
      productId: await productId(t.db, 'SAV-001'),
      unitId: await unitId(t.db, 'SAV-001', 'paquet'),
    });
    expect(skus(result)).toEqual(['SAV-001']);
  });

  it('adds an exact code in its base unit, else in the smallest priced unit', async () => {
    expect((await search('sav-001')).exact?.unitId).toBe(await unitId(t.db, 'SAV-001', 'pièce'));

    await t.db.productUnit.updateMany({
      where: { label: 'kg', product: { sku: 'RIZ-001' } },
      data: { isActive: false },
    });
    expect((await search('RIZ-001')).exact?.unitId).toBe(
      await unitId(t.db, 'RIZ-001', 'sac 25 kg'),
    );
  });

  it('lists a product without price but never adds it directly (RG-ART-03, H14)', async () => {
    await t.db.product.create({
      data: {
        sku: 'VIS-001',
        name: 'Vis à bois',
        baseUnit: 'boîte',
        units: { create: { label: 'boîte', factor: 1, isBase: true } },
      },
    });
    const result = await search('VIS-001');
    expect(result.exact).toBeNull();
    expect(result.items[0]).toMatchObject({ sku: 'VIS-001', available: '0' });
    expect(result.items[0]?.units[0]).toMatchObject({ label: 'boîte', price: null });
  });

  it('never finds an inactive product or unit', async () => {
    await t.db.product.update({ where: { sku: 'SAV-002' }, data: { isActive: false } });
    expect(skus(await search('sav'))).toEqual(['SAV-001']);
    expect((await search('3760000000031')).exact).toBeNull();

    // Deactivating a unit takes its label out of the searched words (trigger).
    await t.db.productUnit.updateMany({
      where: { label: 'carton', product: { sku: 'SAV-001' } },
      data: { isActive: false },
    });
    expect(skus(await search('sav carton'))).toEqual([]);
    const hit = (await search('SAV-001')).items[0];
    expect(hit?.units.map((unit) => unit.label)).toEqual(['pièce', 'paquet']);
  });

  it('filters on a category, the exact code always winning', async () => {
    const food = await t.db.category.findUniqueOrThrow({ where: { name: 'Alimentation' } });
    const filter = `&categoryId=${food.id}`;
    expect(skus(await search('carton', filter))).toEqual(['HUI-001']);
    expect((await search('3760000000017', filter)).exact).not.toBeNull();
  });

  it('waits for the 2nd character before listing', async () => {
    expect(await search('s')).toEqual({ exact: null, items: [], more: false });
  });

  it('rejects an empty or oversized query', async () => {
    for (const q of ['', ' ', 'x'.repeat(101)]) {
      const response = await request(t.app, 'GET', `${SEARCH}?q=${q}`, { cookie });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    }
  });

  it('gives units, prices, available stock and resolved caps (RG-STK-01, RG-REM-01)', async () => {
    await t.db.setting.create({ data: { key: 'default_max_discount_pct', value: 2 } });
    await t.db.productStock.update({
      where: { productId: await productId(t.db, 'SAV-001') },
      data: { reserved: 12 },
    });

    const soap = (await search('SAV-001')).items[0];
    expect(soap).toMatchObject({
      sku: 'SAV-001',
      name: 'Savon de Marseille 200 g',
      category: { name: 'Savons et hygiène' },
      baseUnit: 'pièce',
      available: '420',
    });
    expect(soap?.units).toEqual([
      expect.objectContaining({ label: 'pièce', factor: '1', isBase: true, price: '4500' }),
      expect.objectContaining({ label: 'paquet', factor: '6', price: '25000' }),
      expect.objectContaining({ label: 'carton', factor: '72', price: '280000' }),
    ]);
    // Unit → product → category → setting.
    expect(soap?.units.map((unit) => unit.maxDiscountPct)).toEqual(['5', '5', '8']);
    expect((await search('CLO-001')).items[0]?.units[0]?.maxDiscountPct).toBe('15');
    expect((await search('RIZ-001')).items[0]?.units.map((unit) => unit.maxDiscountPct)).toEqual([
      '2',
      '2',
      '2',
    ]);
    expect((await search('RIZ-001')).items[0]?.available).toBe('1250.5');
  });

  it('keeps the price in force until a scheduled one starts (RG-ART-07)', async () => {
    const piece = await unitId(t.db, 'SAV-001', 'pièce');
    const tomorrow = new Date(Date.now() + 86_400_000);
    const current = await t.db.productPrice.findFirstOrThrow({
      where: { productUnitId: piece, effectiveTo: null },
    });
    await t.db.productPrice.update({ where: { id: current.id }, data: { effectiveTo: tomorrow } });
    await t.db.productPrice.create({
      data: {
        productUnitId: piece,
        price: 5000,
        effectiveFrom: tomorrow,
        source: 'MANUAL',
        setById: current.setById,
      },
    });
    expect((await search('SAV-001')).items[0]?.units[0]?.price).toBe('4500');
  });

  it.each<[Role, boolean]>([
    ['sales', true],
    ['warehouse', false],
  ])('shows discount caps to the %s role: %s (annexe B)', async (role, shown) => {
    const session = await loginOk(t.app, { username: 'vola', role, pin: '1234' });
    const cap = (await search('SAV-001', '', session.cookie)).items[0]?.units[0]?.maxDiscountPct;
    expect(cap).toBe(shown ? '5' : null);
  });
});
