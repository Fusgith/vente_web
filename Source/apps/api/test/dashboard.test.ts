import { randomUUID } from 'node:crypto';

import { customerSchema, dashboardSchema, quoteSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { previousPeriod } from '../src/services/dashboard.js';
import { shopIsoDate } from '../src/services/shop-time.js';
import { productId, seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe('the period compared (RG-DSH-04)', () => {
  it('meets the same days of the month before, otherwise the days just before', () => {
    expect(previousPeriod('2026-10-01', '2026-10-19')).toEqual({
      from: '2026-09-01',
      to: '2026-09-19',
    });
    expect(previousPeriod('2026-03-01', '2026-03-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(previousPeriod('2026-10-19', '2026-10-19')).toEqual({
      from: '2026-10-18',
      to: '2026-10-18',
    });
    expect(previousPeriod('2026-10-12', '2026-10-18')).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('owner dashboard (T-070, RG-DSH-01 à 04)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '', owner: '' };
  let methods: Record<string, string> = {};
  let customer = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    methods = await seedPaymentMethods(t.db);
    await createUser(t.db, {
      username: 'vola',
      roles: ['sales'],
      password: '1234',
      ticketLetter: 'A',
    });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    await createUser(t.db, { username: 'boss', roles: ['owner'], password: 'Boss-1234!' });
    cookies.sales = (
      await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })
    ).cookie;
    cookies.cashier = (
      await loginOk(t.app, { username: 'soa', role: 'cashier', password: '3456' })
    ).cookie;
    cookies.owner = (
      await loginOk(t.app, { username: 'boss', role: 'owner', password: 'Boss-1234!' })
    ).cookie;
    customer = customerSchema.parse(
      (
        await post('/customers', cookies.sales, { name: 'Rasoa Hanta', phone: '034 11 222 33' })
      ).json(),
    ).id;
    const register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.cashier, { stationId: register, openingFloat: '0' });
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }

  /** `qty` kg of nails (6 500,00 MGA each) paid in cash. */
  async function sell(qty: number) {
    const quote = await post('/quotes', cookies.sales, {
      customerId: customer,
      lines: [
        { productUnitId: await unitId(t.db, 'CLO-001', 'kg'), qty: String(qty), discount: null },
      ],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    await post(`/orders/${id}/call`, cookies.cashier);
    const paid = await post(
      `/orders/${id}/pay`,
      cookies.cashier,
      {
        version: 3,
        lines: [{ methodId: methods['CASH'], amount: String(6500 * qty), reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
    expect(paid.statusCode, paid.body).toBe(200);
  }

  it('sums the sales, payments, salespeople, products and price changes of the day', async () => {
    await sell(1);
    await sell(2);
    const nails = await productId(t.db, 'CLO-001');
    const changed = await post(
      `/products/${nails}/units/${await unitId(t.db, 'CLO-001', 'kg')}/prices`,
      cookies.owner,
      { price: '7000' },
    );
    expect(changed.statusCode, changed.body).toBe(200);

    const today = shopIsoDate(new Date());
    const read = await request(t.app, 'GET', `/api/v1/dashboard?from=${today}&to=${today}`, {
      cookie: cookies.owner,
    });
    expect(read.statusCode, read.body).toBe(200);
    const dashboard = dashboardSchema.parse(read.json());
    expect(dashboard.current).toMatchObject({
      collected: '19500.00',
      invoices: 2,
      averageBasket: '9750.00',
      sales: '19500.00',
      gross: '19500.00',
      discounts: '0.00',
      creditNotes: 0,
    });
    expect(dashboard.previous.invoices).toBe(0);
    expect(dashboard.weekBefore.invoices).toBe(0);
    expect(dashboard.byMethod).toEqual([{ label: 'Espèces', amount: '19500.00' }]);
    expect(dashboard.bySalesperson).toEqual([
      { name: 'User vola', invoices: 2, sales: '19500.00' },
    ]);
    expect(dashboard.byDay).toEqual([{ date: today, invoices: 2, sales: '19500.00' }]);
    expect(dashboard.byHour.reduce((sum, hour) => sum + hour.invoices, 0)).toBe(2);
    const stock = await t.db.productStock.findUniqueOrThrow({ where: { productId: nails } });
    expect(dashboard.topProducts).toEqual([
      {
        sku: 'CLO-001',
        name: expect.any(String),
        baseUnit: 'kg',
        baseQty: '3.00',
        units: [{ unit: 'kg', qty: '3.00' }],
        sales: '19500.00',
        available: stock.onHand.minus(stock.reserved).toFixed(2),
      },
    ]);
    expect(dashboard.byCategory).toHaveLength(1);
    expect(dashboard.priceChanges).toEqual([
      expect.objectContaining({ sku: 'CLO-001', unit: 'kg', before: '6500.00', after: '7000.00' }),
    ]);
  });

  it('belongs to the owner and the manager, over a valid period', async () => {
    const forSales = await request(
      t.app,
      'GET',
      '/api/v1/dashboard?from=2026-10-01&to=2026-10-19',
      {
        cookie: cookies.sales,
      },
    );
    expect(forSales.statusCode).toBe(403);
    const reversed = await request(
      t.app,
      'GET',
      '/api/v1/dashboard?from=2026-10-19&to=2026-10-01',
      {
        cookie: cookies.owner,
      },
    );
    expect(reversed.statusCode).toBe(400);
  });
});
