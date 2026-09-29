import { productStockSchema, stockAlertsSchema } from '@vente-web/shared';
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

describe.skipIf(!TEST_DATABASE_URL)('stock adjustments and alerts (RG-STK-05 à 07)', () => {
  let t: TestApp;
  let manager = '';
  let soap = '';
  let piece = '';
  let pack = '';
  let carton = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    manager = (await loginOk(t.app, { username: 'responsable', role: 'manager', pin: '1234' }))
      .cookie;
    soap = await productId(t.db, 'SAV-001');
    piece = await unitId(t.db, 'SAV-001', 'pièce');
    pack = await unitId(t.db, 'SAV-001', 'paquet');
    carton = await unitId(t.db, 'SAV-001', 'carton');
  });

  const stockOf = async (cookie = manager) =>
    request(t.app, 'GET', `/api/v1/products/${soap}/stock`, { cookie });
  const adjust = (body: object, cookie = manager) =>
    request(t.app, 'POST', `/api/v1/products/${soap}/stock/adjustments`, { cookie, body });
  const out = (qty: string, productUnitId: string, reason = 'Casse') =>
    adjust({ direction: 'out', qty, productUnitId, reason, note: null });

  it('takes broken goods out in any unit, journaled, never under the stock available', async () => {
    const before = productStockSchema.parse((await stockOf()).json());
    expect(before).toMatchObject({
      onHand: '432.00',
      reserved: '0.00',
      available: '432.00',
      alertThreshold: '72.00',
    });
    expect(before.units.map((unit) => [unit.label, unit.factor])).toEqual([
      ['pièce', '1'],
      ['paquet', '6'],
      ['carton', '72'],
    ]);
    expect(before.reasons).toContain('Casse');

    const broken = await adjust({
      direction: 'out',
      qty: '2',
      productUnitId: carton,
      reason: 'Casse',
      note: 'Carton tombé du rayon',
    });
    expect(broken.statusCode).toBe(200);
    expect(productStockSchema.parse(broken.json())).toMatchObject({
      onHand: '288.00',
      available: '288.00',
    });
    const movement = await t.db.stockMovement.findFirstOrThrow({
      where: { productId: soap, type: 'ADJUSTMENT' },
    });
    expect([movement.qty.toFixed(2), movement.unitQty?.toFixed(), movement.reason]).toEqual([
      '-144.00',
      '2',
      'Casse',
    ]);
    expect(await auditActions(t.db, soap)).toContain('stock.adjust');
    const entry = await t.db.auditLog.findFirstOrThrow({ where: { action: 'stock.adjust' } });
    expect(entry.reason).toBe('Casse');
    expect(entry.before).toEqual({ onHand: '432.00', reserved: '0.00' });
    expect(entry.after).toMatchObject({ onHand: '288.00', note: 'Carton tombé du rayon' });

    const found = await adjust({
      direction: 'in',
      qty: '1',
      productUnitId: pack,
      reason: 'Erreur de comptage',
      note: null,
    });
    expect(productStockSchema.parse(found.json()).onHand).toBe('294.00');

    // Goods of validated orders stay theirs: at most the available stock goes out.
    await t.db.productStock.update({ where: { productId: soap }, data: { reserved: 260 } });
    const tooMuch = await out('35', piece, 'Vol');
    expect(tooMuch.statusCode).toBe(409);
    expect(tooMuch.json()).toMatchObject({
      code: 'ADJUSTMENT_TOO_LARGE',
      details: { available: '34.00', baseUnit: 'pièce' },
    });
    expect((await out('34', piece, 'Vol')).statusCode).toBe(200);
    expect(productStockSchema.parse((await stockOf()).json()).available).toBe('0.00');
  });

  it('refuses a reason off the list, a unit of another product, and other roles', async () => {
    const unknown = await out('1', piece, 'Cadeau');
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ code: 'ADJUSTMENT_REASON_UNKNOWN' });
    expect((await out('1', await unitId(t.db, 'RIZ-001', 'kg'))).statusCode).toBe(404);

    await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '3456' });
    const cashier = (await loginOk(t.app, { username: 'soa', role: 'cashier', pin: '3456' }))
      .cookie;
    expect((await stockOf(cashier)).statusCode).toBe(403);
    const refused = await adjust(
      { direction: 'out', qty: '1', productUnitId: piece, reason: 'Casse', note: null },
      cashier,
    );
    expect(refused.statusCode).toBe(403);
    expect(
      (await request(t.app, 'GET', '/api/v1/stock/alerts', { cookie: cashier })).statusCode,
    ).toBe(403);
    expect(await t.db.stockMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(0);
  });

  it('lists the products at or under their threshold, the furthest under first', async () => {
    const alerts = async () =>
      stockAlertsSchema.parse(
        (await request(t.app, 'GET', '/api/v1/stock/alerts', { cookie: manager })).json(),
      ).items;
    expect((await alerts()).map((alert) => alert.sku)).not.toContain('SAV-001');

    await out('5', carton);
    const [first] = (await alerts()).filter((alert) => alert.sku === 'SAV-001');
    expect(first).toMatchObject({
      productId: soap,
      name: 'Savon de Marseille 200 g',
      baseUnit: 'pièce',
      available: '72.00',
      alertThreshold: '72.00',
    });
  });
});
