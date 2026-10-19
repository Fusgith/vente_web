import { customerSchema, quoteSchema, type Quote } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopYear } from '../src/services/shop-time.js';
import { seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const QUOTES = '/api/v1/quotes';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!TEST_DATABASE_URL)('quotes (RG-DEV-01/02/05, RG-REM-01/02)', () => {
  let t: TestApp;
  const cookies: Record<'sales' | 'otherSales' | 'cashier' | 'manager' | 'warehouse', string> = {
    sales: '',
    otherSales: '',
    cashier: '',
    manager: '',
    warehouse: '',
  };
  let salesId: string;
  let customerId: string;
  /** SAV-001 paquet (cap 5 % of the category), CLO-001 kg (15 % of the product), RIZ-001 kg (0). */
  const units = { soapPack: '', nails: '', rice: '' };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    salesId = (await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' })).id;
    await createUser(t.db, { username: 'hery', roles: ['sales'], password: '2345' });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], password: '4567' });
    for (const [key, username, role, password] of [
      ['sales', 'vola', 'sales', '1234'],
      ['otherSales', 'hery', 'sales', '2345'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['manager', 'responsable', 'manager', '1234'],
      ['warehouse', 'feno', 'warehouse', '4567'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
    const customer = await request(t.app, 'POST', '/api/v1/customers', {
      cookie: cookies.sales,
      body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
    });
    customerId = customerSchema.parse(customer.json()).id;
    units.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
    units.nails = await unitId(t.db, 'CLO-001', 'kg');
    units.rice = await unitId(t.db, 'RIZ-001', 'kg');
  });

  /** 2 packs of soap at 5 % (its whole cap) and 3 kg of nails, 2 000 off the total. */
  const draft = () => ({
    customerId,
    lines: [
      { productUnitId: units.soapPack, qty: '2', discount: { kind: 'pct', value: '5' } },
      { productUnitId: units.nails, qty: '3', discount: null },
    ],
    orderDiscount: { kind: 'amount', value: '2000' },
  });
  const save = (body: unknown, cookie = cookies.sales) =>
    request(t.app, 'POST', QUOTES, { cookie, body });
  const resave = (id: string, body: unknown, cookie = cookies.sales) =>
    request(t.app, 'PUT', `${QUOTES}/${id}`, { cookie, body });
  async function saved(body: unknown = draft()): Promise<Quote> {
    const response = await save(body);
    expect(response.statusCode, response.body).toBe(201);
    return quoteSchema.parse(response.json());
  }

  it('prices, caps, totals and numbers the quote on the server', async () => {
    const body = draft();
    // A price sent by the tablet is ignored: the price in force is the server's (RG-ART-07).
    const quote = await saved({
      ...body,
      lines: [{ ...body.lines[0], unitPrice: '1' }, body.lines[1]],
    });
    const year = shopYear(new Date());
    expect(quote).toMatchObject({
      number: `D-${year}-000001`,
      version: 1,
      customer: { id: customerId, name: 'Rasoa Hanta' },
      salesUser: { id: salesId },
      grossTotal: '69500.00',
      lineDiscounts: '2500.00',
      subtotal: '67000.00',
      orderDiscountPct: null,
      orderDiscount: '2000.00',
      discountTotal: '4500.00',
      total: '65000.00',
    });
    expect(quote.lines).toMatchObject([
      {
        position: 1,
        sku: 'SAV-001',
        unitLabel: 'paquet',
        factor: '6',
        baseUnit: 'pièce',
        qty: '2',
        unitPrice: '25000.00',
        capPct: '5',
        gross: '50000.00',
        discountPct: '5.00',
        discountAmount: '2500.00',
        net: '47500.00',
      },
      { position: 2, sku: 'CLO-001', unitPrice: '6500.00', capPct: '15', net: '19500.00' },
    ]);
    const stored = await t.db.orderLine.findFirstOrThrow({
      where: { orderId: quote.id, position: 1 },
    });
    expect(stored.baseQty.toFixed(2)).toBe('12.00');
    expect(stored.productPriceId).toBeNull();
    expect(await auditActions(t.db, quote.id)).toEqual(['quote.created']);

    expect((await saved()).number).toBe(`D-${year}-000002`);
  });

  it('lets the cashier read a quote, never the warehouse', async () => {
    const quote = await saved();
    const read = await request(t.app, 'GET', `${QUOTES}/${quote.id}`, { cookie: cookies.cashier });
    expect(read.statusCode, read.body).toBe(200);
    expect(quoteSchema.parse(read.json())).toEqual(quote);
    const refused = await request(t.app, 'GET', `${QUOTES}/${quote.id}`, {
      cookie: cookies.warehouse,
    });
    expect(refused.statusCode).toBe(403);
    expect((await save(draft(), cookies.cashier)).statusCode).toBe(403);
  });

  it('opens the quote in A4 for its readers, never the warehouse (RG-PDF-01)', async () => {
    const quote = await saved();
    const open = (id: string, cookie: string) =>
      request(t.app, 'GET', `${QUOTES}/${id}/pdf`, { cookie });
    const pdf = await open(quote.id, cookies.cashier);
    expect(pdf.statusCode, pdf.body).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe(`inline; filename="${quote.number}.pdf"`);
    expect(pdf.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((await open(quote.id, cookies.warehouse)).statusCode).toBe(403);
    expect((await open(UNKNOWN_ID, cookies.cashier)).statusCode).toBe(404);
  });

  it('refuses a discount beyond its cap, naming what passed it', async () => {
    const onLine = await save({
      ...draft(),
      lines: [
        { productUnitId: units.rice, qty: '1', discount: { kind: 'pct', value: '1' } },
        { productUnitId: units.nails, qty: '3', discount: null },
      ],
      orderDiscount: null,
    });
    expect(onLine.statusCode).toBe(422);
    expect(onLine.json()).toMatchObject({
      code: 'QUOTE_DISCOUNT_BEYOND_CAP',
      details: { lines: [1], order: false },
    });
    // The soap's cap is used up by its line discount: only the nails' 2 925 remain for the total.
    const onTotal = await save({ ...draft(), orderDiscount: { kind: 'amount', value: '3000' } });
    expect(onTotal.statusCode).toBe(422);
    expect(onTotal.json()).toMatchObject({ details: { lines: [], order: true } });
    expect(await t.db.order.count()).toBe(0);
  });

  it('refuses a missing or inactive customer, a unit no longer sold, a unit twice', async () => {
    expect((await save({ ...draft(), customerId: undefined })).statusCode).toBe(400);
    expect((await save({ ...draft(), customerId: UNKNOWN_ID })).statusCode).toBe(404);

    await t.db.productUnit.update({ where: { id: units.nails }, data: { isActive: false } });
    const unavailable = await save(draft());
    expect(unavailable.statusCode).toBe(422);
    expect(unavailable.json()).toMatchObject({
      code: 'QUOTE_LINE_UNAVAILABLE',
      details: { lines: [2] },
    });

    const body = draft();
    const twice = await save({ ...body, lines: [body.lines[0], body.lines[0]] });
    expect(twice.statusCode).toBe(400);

    await t.db.customer.update({ where: { id: customerId }, data: { isActive: false } });
    const inactive = await save({ ...body, lines: [body.lines[0]], orderDiscount: null });
    expect(inactive.statusCode).toBe(409);
    expect(inactive.json()).toMatchObject({ code: 'CUSTOMER_INACTIVE' });
    expect(await t.db.order.count()).toBe(0);
  });

  it('saves again over the version read, by its salesperson or the manager', async () => {
    const quote = await saved();
    const nailsOnly = {
      customerId,
      lines: [{ productUnitId: units.nails, qty: '5', discount: null }],
      orderDiscount: null,
      version: 1,
    };
    const updated = await resave(quote.id, nailsOnly);
    expect(updated.statusCode, updated.body).toBe(200);
    expect(quoteSchema.parse(updated.json())).toMatchObject({
      number: quote.number,
      version: 2,
      lines: [{ position: 1, sku: 'CLO-001', qty: '5' }],
      total: '32500.00',
    });
    expect(await t.db.orderLine.count({ where: { orderId: quote.id } })).toBe(1);

    const stale = await resave(quote.id, nailsOnly);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'QUOTE_CHANGED' });
    const current = { ...nailsOnly, version: 2 };
    expect((await resave(quote.id, current, cookies.otherSales)).statusCode).toBe(403);
    expect((await resave(quote.id, current, cookies.manager)).statusCode).toBe(200);
    expect(await auditActions(t.db, quote.id)).toEqual([
      'quote.created',
      'quote.updated',
      'quote.updated',
    ]);

    // Once validated it is an order: no longer a quote to edit (T-032).
    await t.db.order.update({ where: { id: quote.id }, data: { status: 'SUBMITTED' } });
    const validated = await resave(quote.id, { ...nailsOnly, version: 3 });
    expect(validated.statusCode).toBe(409);
    expect(validated.json()).toMatchObject({ code: 'QUOTE_NOT_DRAFT' });
    const read = await request(t.app, 'GET', `${QUOTES}/${quote.id}`, { cookie: cookies.sales });
    expect(read.statusCode).toBe(404);
  });

  it('saves a quote handed over, its PDF opened, under a new number (H69)', async () => {
    const quote = await saved();
    const year = shopYear(new Date());
    const body = { ...draft(), version: 1 };
    // Not handed over yet: the same number.
    expect(quoteSchema.parse((await resave(quote.id, body)).json()).number).toBe(quote.number);
    await request(t.app, 'GET', `${QUOTES}/${quote.id}/pdf`, { cookie: cookies.sales });
    const changed = quoteSchema.parse((await resave(quote.id, { ...body, version: 2 })).json());
    expect(changed).toMatchObject({ id: quote.id, number: `D-${year}-000002`, version: 3 });
    const old = await t.db.order.findUniqueOrThrow({
      where: { number: quote.number },
      include: { lines: true },
    });
    expect(old).toMatchObject({ status: 'REPLACED', replacedById: quote.id });
    expect(old.lines).toHaveLength(2);
    expect(await auditActions(t.db, quote.id)).toEqual([
      'quote.created',
      'quote.updated',
      'order.replaced',
      'quote.updated',
    ]);
    // Saved again before its PDF is opened anew: the number stays.
    const again = quoteSchema.parse((await resave(quote.id, { ...body, version: 3 })).json());
    expect(again.number).toBe(changed.number);
    // The old number still finds it.
    const found = await request(t.app, 'GET', `${QUOTES}?number=${quote.number}`, {
      cookie: cookies.sales,
    });
    expect(found.json()).toMatchObject({ orders: [{ id: quote.id, number: changed.number }] });
  });
});
