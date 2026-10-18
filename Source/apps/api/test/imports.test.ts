import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { importDetailSchema, importListSchema } from '@vente-web/shared';
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

const HEADER = 'code;categorie;designation;unite;facteur;quantite;prix_vente;code_barres;actif';

/** A French Excel CSV: `;`, decimal comma, a BOM. */
function csv(...rows: string[]): string {
  const bom = String.fromCharCode(0xfeff);
  return Buffer.from(`${bom}${[HEADER, ...rows].join('\r\n')}`, 'utf8').toString('base64');
}

describe.skipIf(!TEST_DATABASE_URL)('catalog import from Excel (T-020, RG-IMP-01 à 08)', () => {
  let t: TestApp;
  let manager = '';
  let admin = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'adm', roles: ['admin'], password: 'Admin-1234!' });
    manager = (await loginOk(t.app, { username: 'responsable', role: 'manager', password: '1234' }))
      .cookie;
    admin = (await loginOk(t.app, { username: 'adm', role: 'admin', password: 'Admin-1234!' }))
      .cookie;
  });

  const upload = (content: string, mode = 'ENTRY', cookie = manager) =>
    request(t.app, 'POST', '/api/v1/imports', {
      cookie,
      body: { fileName: 'arrivage.csv', mode, entryDate: '2026-10-18', content },
    });
  const commit = (id: string, validOnly = false) =>
    request(t.app, 'POST', `/api/v1/imports/${id}/commit`, {
      cookie: manager,
      body: { validOnly },
    });
  const onHand = async (sku: string) =>
    (
      await t.db.productStock.findUniqueOrThrow({
        where: { productId: await productId(t.db, sku) },
      })
    ).onHand.toFixed(2);

  it('previews line by line, then records products, units, prices and the entry', async () => {
    const sent = await upload(
      csv(
        'SAV-001;;;pièce;;10;5 000,00;;',
        'SAV-001;;;carton;72;1;;;',
        'NEW-001;Épicerie;Lait concentré 397 g;boîte;;48;3 500;;',
        'NEW-001;;;carton;24;2;80000;;',
        'BAD-001;Alimentation;Sel fin;sachet;;abc;1000;;',
        'BAD-001;;;carton;20;1;18000;;',
      ),
    );
    expect(sent.statusCode).toBe(201);
    const preview = importDetailSchema.parse(sent.json());
    expect(preview).toMatchObject({ status: 'PREVIEW', rowsTotal: 6, rowsOk: 4, rowsError: 2 });
    expect(preview.totals).toMatchObject({
      productsCreated: 1,
      productsUpdated: 1,
      unitsCreated: 2,
      qtyIn: '178.00',
      pricesChanged: 3,
    });
    const [soap, carton, milk] = preview.lines;
    expect(soap).toMatchObject({
      product: 'update',
      stockBefore: '432.00',
      stockAfter: '514.00',
      priceBefore: '4500.00',
      price: '5000.00',
      errors: [],
    });
    expect(carton).toMatchObject({ baseQty: '72.00', price: null, priceBefore: '280000.00' });
    expect(milk?.warnings).toContain('NEW_CATEGORY');
    expect(preview.lines[4]?.errors).toEqual(['QTY_INVALID']);
    expect(preview.lines[5]?.errors).toEqual(['SIBLING_ERROR']);

    // The uploaded file is kept (RG-IMP-06); nothing is recorded yet.
    const batch = await t.db.importBatch.findUniqueOrThrow({ where: { id: preview.id } });
    expect((await readFile(path.join(t.filesDir, batch.filePath), 'utf8')).length).toBeGreaterThan(
      0,
    );
    expect(await onHand('SAV-001')).toBe('432.00');

    // All or nothing by default (RG-IMP-05).
    expect((await commit(preview.id)).json().code).toBe('IMPORT_HAS_ERRORS');
    const done = importDetailSchema.parse((await commit(preview.id, true)).json());
    expect(done).toMatchObject({ status: 'COMMITTED', rowsOk: 4 });
    expect((await commit(preview.id, true)).json().code).toBe('IMPORT_CLOSED');

    expect(await onHand('SAV-001')).toBe('514.00');
    expect(await onHand('NEW-001')).toBe('96.00');
    expect(await t.db.product.count({ where: { sku: 'BAD-001' } })).toBe(0);
    const prices = await t.db.productPrice.findMany({
      where: { productUnitId: await unitId(t.db, 'SAV-001', 'pièce') },
      orderBy: { effectiveFrom: 'asc' },
    });
    expect(prices.map((price) => [price.price.toFixed(2), price.effectiveTo === null])).toEqual([
      ['4500.00', false],
      ['5000.00', true],
    ]);
    expect(prices[1]?.importBatchId).toBe(preview.id);
    const movements = await t.db.stockMovement.findMany({ where: { importBatchId: preview.id } });
    expect(movements).toHaveLength(4);
    expect(movements.every((movement) => movement.type === 'IMPORT')).toBe(true);
    expect(await auditActions(t.db, await productId(t.db, 'NEW-001'))).toContain(
      'product.imported',
    );
    expect(await auditActions(t.db, preview.id)).toContain('import.committed');

    const history = importListSchema.parse(
      (await request(t.app, 'GET', '/api/v1/imports', { cookie: admin })).json(),
    );
    expect(history.items[0]).toMatchObject({ id: preview.id, status: 'COMMITTED' });
  });

  it('replaces the stock on a stocktake, for the manager only, above the reserved goods', async () => {
    const content = csv('SAV-001;;;pièce;;400;;;', 'SAV-001;;;carton;72;0;;;');
    expect((await upload(content, 'STOCKTAKE', admin)).statusCode).toBe(403);
    const preview = importDetailSchema.parse((await upload(content, 'STOCKTAKE')).json());
    expect(preview.lines[0]).toMatchObject({ stockBefore: '432.00', stockAfter: '400.00' });
    await commit(preview.id);
    expect(await onHand('SAV-001')).toBe('400.00');
    const [movement] = await t.db.stockMovement.findMany({ where: { importBatchId: preview.id } });
    expect(movement).toMatchObject({ type: 'STOCKTAKE', reason: 'Inventaire' });
    expect(movement?.qty.toFixed(2)).toBe('-32.00');
  });

  it('cancels a preview, refuses unreadable or incomplete files', async () => {
    const preview = importDetailSchema.parse((await upload(csv('SAV-001;;;pièce;;1;;;'))).json());
    const cancelled = await request(t.app, 'POST', `/api/v1/imports/${preview.id}/cancel`, {
      cookie: manager,
    });
    expect(cancelled.json()).toMatchObject({ status: 'CANCELLED' });
    expect((await commit(preview.id)).json().code).toBe('IMPORT_CLOSED');
    expect(await onHand('SAV-001')).toBe('432.00');

    const missing = Buffer.from('code;designation\nX;Y').toString('base64');
    expect((await upload(missing)).json()).toMatchObject({ code: 'IMPORT_COLUMNS_MISSING' });
    const template = await request(t.app, 'GET', '/api/v1/imports/template', { cookie: manager });
    expect(template.statusCode).toBe(200);
    expect(template.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });
});
