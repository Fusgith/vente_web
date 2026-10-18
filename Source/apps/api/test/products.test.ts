import { productDetailSchema, productListSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { productId, seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)(
  'products on screen (T-092, T-019, RG-ART-01 à 07, H65)',
  () => {
    let t: TestApp;
    let manager = '';
    let sales = '';

    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      await t.reset();
      await seedDemoCatalog(t.db);
      await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' });
      manager = (
        await loginOk(t.app, { username: 'responsable', role: 'manager', password: '1234' })
      ).cookie;
      sales = (await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })).cookie;
    });

    const create = (body: object, cookie = manager) =>
      request(t.app, 'POST', '/api/v1/products', { cookie, body });
    const NEW = {
      sku: 'EAU-050',
      name: 'Eau minérale 50 cl',
      categoryId: null,
      baseUnit: 'bouteille',
      alertThreshold: '24',
      barcode: null,
      price: '1500',
    };

    it('creates a product with its base unit and first price, journaled', async () => {
      const created = await create(NEW);
      expect(created.statusCode).toBe(201);
      const product = productDetailSchema.parse(created.json());
      expect(product).toMatchObject({ sku: 'EAU-050', onHand: '0.00', alertThreshold: '24.00' });
      expect(product.units).toHaveLength(1);
      expect(product.units[0]).toMatchObject({
        label: 'bouteille',
        factor: '1',
        isBase: true,
        price: '1500.00',
      });
      expect(await auditActions(t.db, product.id)).toContain('product.created');

      // The new product is found by the quick search of the tablet (RG-DEV-06).
      const found = await request(t.app, 'GET', '/api/v1/products/search?q=EAU-050', {
        cookie: sales,
      });
      expect(found.json().exact).not.toBeNull();

      expect((await create({ ...NEW, sku: 'eau-050 ' })).json().code).toBe('PRODUCT_SKU_TAKEN');
      expect((await create(NEW, sales)).statusCode).toBe(403);
      expect((await create({ ...NEW, sku: 'EAU-051', price: '0' })).statusCode).toBe(400);
    });

    it('adds units up to three active, freezes nothing unused, refuses a fourth', async () => {
      const product = productDetailSchema.parse((await create(NEW)).json());
      const units = `/api/v1/products/${product.id}/units`;
      const pack = await request(t.app, 'POST', units, {
        cookie: manager,
        body: { label: 'pack', factor: '6', barcode: '6001', price: '8500' },
      });
      expect(pack.statusCode).toBe(201);
      const carton = await request(t.app, 'POST', units, {
        cookie: manager,
        body: { label: 'carton', factor: '24', barcode: null, price: null },
      });
      const detail = productDetailSchema.parse(carton.json());
      expect(detail.units.map((unit) => [unit.label, unit.factor, unit.price])).toEqual([
        ['bouteille', '1', '1500.00'],
        ['pack', '6', '8500.00'],
        ['carton', '24', null],
      ]);
      const fourth = await request(t.app, 'POST', units, {
        cookie: manager,
        body: { label: 'palette', factor: '480', barcode: null, price: null },
      });
      expect(fourth.json().code).toBe('UNIT_LIMIT_REACHED');
      const twin = await request(t.app, 'POST', units, {
        cookie: manager,
        body: { label: 'pack', factor: '12', barcode: null, price: null },
      });
      expect(twin.statusCode).toBe(409);

      // Deactivated, the carton frees a place; its factor changes while no order uses it.
      const cartonId = detail.units.find((unit) => unit.label === 'carton')!.id;
      const changed = await request(t.app, 'PATCH', `${units}/${cartonId}`, {
        cookie: manager,
        body: { factor: '12', isActive: false },
      });
      expect(changed.statusCode).toBe(200);
      const base = detail.units.find((unit) => unit.isBase)!.id;
      const baseFactor = await request(t.app, 'PATCH', `${units}/${base}`, {
        cookie: manager,
        body: { factor: '2' },
      });
      expect(baseFactor.json().code).toBe('UNIT_BASE_FACTOR');
    });

    it('changes a price by a new dated price, the old one kept (RG-ART-07)', async () => {
      const soap = await productId(t.db, 'SAV-001');
      const piece = await unitId(t.db, 'SAV-001', 'pièce');
      const path = `/api/v1/products/${soap}/units/${piece}/prices`;
      const before = productDetailSchema.parse(
        (await request(t.app, 'GET', `/api/v1/products/${soap}`, { cookie: manager })).json(),
      );
      const old = before.units.find((unit) => unit.id === piece)!.price;
      const changed = await request(t.app, 'POST', path, {
        cookie: manager,
        body: { price: '4800' },
      });
      const unit = productDetailSchema.parse(changed.json()).units.find((one) => one.id === piece)!;
      expect(unit.price).toBe('4800.00');
      expect(unit.prices.map((entry) => [entry.price, entry.effectiveTo === null])).toEqual([
        ['4800.00', true],
        [old, false],
      ]);
      const same = await request(t.app, 'POST', path, {
        cookie: manager,
        body: { price: '4800.00' },
      });
      expect(same.json().code).toBe('PRICE_UNCHANGED');
      expect(await auditActions(t.db, soap)).toContain('product_price.set');
    });

    it('lists, searches and deactivates products', async () => {
      const all = productListSchema.parse(
        (await request(t.app, 'GET', '/api/v1/products', { cookie: manager })).json(),
      );
      expect(all.total).toBe(9);
      const soap = all.items.find((item) => item.sku === 'SAV-001')!;
      expect(soap.units.length).toBeGreaterThan(0);
      const off = await request(t.app, 'PATCH', `/api/v1/products/${soap.id}`, {
        cookie: manager,
        body: { isActive: false, name: 'Savon de Marseille' },
      });
      expect(productDetailSchema.parse(off.json())).toMatchObject({ isActive: false });
      const active = productListSchema.parse(
        (await request(t.app, 'GET', '/api/v1/products?q=sav', { cookie: manager })).json(),
      );
      expect(active.items.map((item) => item.sku)).not.toContain('SAV-001');
      const withInactive = productListSchema.parse(
        (
          await request(t.app, 'GET', '/api/v1/products?q=sav&inactive=1', { cookie: manager })
        ).json(),
      );
      expect(withInactive.items.map((item) => item.sku)).toContain('SAV-001');
    });
  },
);
