import { discountCapsSchema, productDiscountCapsSchema } from '@vente-web/shared';
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

const PASSWORD = 'Boss-1234!';

describe.skipIf(!TEST_DATABASE_URL)('discount caps set by the owner (RG-REM-01, H15)', () => {
  let t: TestApp;
  let owner = '';
  let manager = '';
  let soap = '';
  let carton = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'boss', roles: ['owner'], password: PASSWORD });
    owner = (await loginOk(t.app, { username: 'boss', role: 'owner', password: PASSWORD })).cookie;
    manager = (await loginOk(t.app, { username: 'responsable', role: 'manager', pin: '1234' }))
      .cookie;
    soap = await productId(t.db, 'SAV-001');
    carton = await unitId(t.db, 'SAV-001', 'carton');
  });

  const capsOf = async (cookie = owner) =>
    productDiscountCapsSchema.parse(
      (await request(t.app, 'GET', `/api/v1/products/${soap}/discount-caps`, { cookie })).json(),
    );
  const effective = async () =>
    Object.fromEntries((await capsOf()).units.map((unit) => [unit.label, unit.effectivePct]));
  const put = (path: string, pct: string | null, cookie = owner) =>
    request(t.app, 'PUT', `/api/v1${path}`, { cookie, body: { pct } });

  it('resolves unit, product, category, then the general cap, each set by the owner', async () => {
    const caps = await capsOf();
    expect(caps).toMatchObject({
      sku: 'SAV-001',
      maxDiscountPct: null,
      category: { name: 'Savons et hygiène', maxDiscountPct: '5.00' },
      defaultPct: '0.00',
    });
    expect(await effective()).toEqual({ pièce: '5.00', paquet: '5.00', carton: '8.00' });

    expect((await put(`/products/${soap}/discount-cap`, '6')).statusCode).toBe(200);
    expect(await effective()).toEqual({ pièce: '6.00', paquet: '6.00', carton: '8.00' });
    const entry = await t.db.auditLog.findFirstOrThrow({
      where: { action: 'discount_cap.set', entityId: soap },
    });
    expect([entry.entityType, entry.before, entry.after]).toEqual([
      'product',
      { maxDiscountPct: null },
      { maxDiscountPct: '6.00' },
    ]);

    const cleared = productDiscountCapsSchema.parse(
      (await put(`/product-units/${carton}/discount-cap`, null)).json(),
    );
    expect(cleared.units.find((unit) => unit.label === 'carton')).toMatchObject({
      maxDiscountPct: null,
      effectivePct: '6.00',
    });
    expect(await auditActions(t.db, carton)).toEqual(['discount_cap.set']);

    const category = caps.category!.id;
    await put(`/products/${soap}/discount-cap`, null);
    const list = discountCapsSchema.parse(
      (await put(`/categories/${category}/discount-cap`, null)).json(),
    );
    expect(list.categories.find((row) => row.id === category)?.maxDiscountPct).toBeNull();
    expect(await effective()).toEqual({ pièce: '0.00', paquet: '0.00', carton: '0.00' });

    const general = discountCapsSchema.parse((await put('/discount-caps/default', '2.5')).json());
    expect(general.defaultPct).toBe('2.50');
    expect(await effective()).toEqual({ pièce: '2.50', paquet: '2.50', carton: '2.50' });
    expect(await auditActions(t.db, 'default_max_discount_pct')).toEqual(['discount_cap.set']);
  });

  it('lets the other roles read the caps, never change them', async () => {
    expect((await capsOf(manager)).category?.maxDiscountPct).toBe('5.00');
    expect((await put(`/products/${soap}/discount-cap`, '6', manager)).statusCode).toBe(403);
    expect((await put('/discount-caps/default', '6', manager)).statusCode).toBe(403);
    expect((await put(`/products/${soap}/discount-cap`, '100.5')).statusCode).toBe(400);
    expect((await put('/discount-caps/default', null)).statusCode).toBe(400);

    await createUser(t.db, { username: 'lova', roles: ['warehouse'], pin: '4567' });
    const warehouse = (await loginOk(t.app, { username: 'lova', role: 'warehouse', pin: '4567' }))
      .cookie;
    expect(
      (await request(t.app, 'GET', '/api/v1/discount-caps', { cookie: warehouse })).statusCode,
    ).toBe(403);
    expect(await t.db.auditLog.count({ where: { action: 'discount_cap.set' } })).toBe(0);
  });
});
