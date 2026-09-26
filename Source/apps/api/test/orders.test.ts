import { customerSchema, orderSchema, quoteSchema, type Order } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopDateValue } from '../src/services/shop-time.js';
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

const today = () => shopDateValue(new Date()).toISOString().slice(0, 10);

describe.skipIf(!TEST_DATABASE_URL)('order validation (RG-CMD-02/03/04, RG-TKT-01)', () => {
  let t: TestApp;
  const cookies: Record<'sales' | 'otherSales' | 'noLetter' | 'cashier' | 'manager', string> = {
    sales: '',
    otherSales: '',
    noLetter: '',
    cashier: '',
    manager: '',
  };
  const ids = { vola: '', hery: '', customer: '', soap: '', nails: '' };
  /** SAV-001: 432 pieces in stock; CLO-001: 48,75 kg. */
  const units = { soapPiece: '', soapPack: '', soapCarton: '', nails: '' };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    ids.vola = (
      await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234', ticketLetter: 'A' })
    ).id;
    ids.hery = (
      await createUser(t.db, { username: 'hery', roles: ['sales'], pin: '2345', ticketLetter: 'B' })
    ).id;
    await createUser(t.db, { username: 'lova', roles: ['sales'], pin: '5678' });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '3456' });
    for (const [key, username, role, pin] of [
      ['sales', 'vola', 'sales', '1234'],
      ['otherSales', 'hery', 'sales', '2345'],
      ['noLetter', 'lova', 'sales', '5678'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['manager', 'responsable', 'manager', '1234'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, pin })).cookie;
    const customer = await request(t.app, 'POST', '/api/v1/customers', {
      cookie: cookies.sales,
      body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.soap = await productId(t.db, 'SAV-001');
    ids.nails = await productId(t.db, 'CLO-001');
    units.soapPiece = await unitId(t.db, 'SAV-001', 'pièce');
    units.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
    units.soapCarton = await unitId(t.db, 'SAV-001', 'carton');
    units.nails = await unitId(t.db, 'CLO-001', 'kg');
  });

  type Line = { productUnitId: string; qty: string; discount?: unknown };

  /** A quote saved by `vola` (or another salesperson): 2 packs of soap at 5 %, 3 kg of nails. */
  async function savedQuote(
    lines: Line[] = [
      { productUnitId: units.soapPack, qty: '2', discount: { kind: 'pct', value: '5' } },
      { productUnitId: units.nails, qty: '3' },
    ],
    cookie = cookies.sales,
  ) {
    const response = await request(t.app, 'POST', '/api/v1/quotes', {
      cookie,
      body: {
        customerId: ids.customer,
        lines: lines.map((line) => ({ discount: null, ...line })),
        orderDiscount: null,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return quoteSchema.parse(response.json());
  }

  const submit = (id: string, version: number, cookie = cookies.sales) =>
    request(t.app, 'POST', `/api/v1/orders/${id}/submit`, { cookie, body: { version } });

  async function submitted(id: string, version = 1, cookie = cookies.sales): Promise<Order> {
    const response = await submit(id, version, cookie);
    expect(response.statusCode, response.body).toBe(200);
    return orderSchema.parse(response.json());
  }

  const stock = async (id: string) => {
    const row = await t.db.productStock.findUniqueOrThrow({ where: { productId: id } });
    return { onHand: row.onHand.toFixed(2), reserved: row.reserved.toFixed(2) };
  };

  it('reserves, freezes the prices, gives a ticket and queues the order', async () => {
    const quote = await savedQuote();
    const order = await submitted(quote.id);

    expect(order).toMatchObject({
      id: quote.id,
      number: quote.number,
      status: 'SUBMITTED',
      version: 2,
      ticket: { letter: 'A', seq: 1, date: today() },
      salesUser: { id: ids.vola },
      total: quote.total,
    });
    expect(Date.parse(order.expiresAt!)).toBeGreaterThan(Date.now());
    // 2 packs of 6 in base unit (RG-ART-06); the stock itself leaves at delivery (RG-STK-04).
    expect(await stock(ids.soap)).toEqual({ onHand: '432.00', reserved: '12.00' });
    expect(await stock(ids.nails)).toEqual({ onHand: '48.75', reserved: '3.00' });
    const reservations = await t.db.reservation.findMany({ where: { orderId: quote.id } });
    expect(reservations.map((r) => [r.productId, r.qty.toFixed(2), r.status])).toEqual(
      expect.arrayContaining([
        [ids.soap, '12.00', 'ACTIVE'],
        [ids.nails, '3.00', 'ACTIVE'],
      ]),
    );
    expect(reservations.every((r) => r.expiresAt?.toISOString() === order.expiresAt)).toBe(true);

    // RG-CMD-04: each line references the price row in force when validated.
    const lines = await t.db.orderLine.findMany({
      where: { orderId: quote.id },
      include: { productPrice: true },
      orderBy: { position: 'asc' },
    });
    expect(lines.map((line) => line.productPrice?.price.toFixed(2))).toEqual([
      '25000.00',
      '6500.00',
    ]);
    expect(lines.every((line) => line.productPrice?.effectiveTo === null)).toBe(true);

    const stored = await t.db.order.findUniqueOrThrow({ where: { id: quote.id } });
    expect(stored.queueRank).toBe(1);
    expect(stored.submittedAt).not.toBeNull();
    expect(await auditActions(t.db, quote.id)).toEqual(['quote.created', 'order.submitted']);

    // A quote is no longer: its screens refuse it, the order reads for the cashier.
    expect(
      (await request(t.app, 'GET', `/api/v1/quotes/${quote.id}`, { cookie: cookies.sales }))
        .statusCode,
    ).toBe(404);
    const read = await request(t.app, 'GET', `/api/v1/orders/${quote.id}`, {
      cookie: cookies.cashier,
    });
    expect(orderSchema.parse(read.json())).toEqual(order);
  });

  it('numbers the tickets of the day per letter, and queues in order of entry', async () => {
    const first = await submitted((await savedQuote()).id);
    const second = await submitted((await savedQuote()).id);
    const byHery = await submitted(
      (await savedQuote(undefined, cookies.otherSales)).id,
      1,
      cookies.otherSales,
    );
    expect(
      [first, second, byHery].map((o) => o.ticket && `${o.ticket.letter}${o.ticket.seq}`),
    ).toEqual(['A1', 'A2', 'B1']);
    const ranks = await t.db.order.findMany({
      where: { id: { in: [first.id, second.id, byHery.id] } },
      orderBy: { queueRank: 'asc' },
      select: { id: true },
    });
    expect(ranks.map((row) => row.id)).toEqual([first.id, second.id, byHery.id]);
  });

  it('checks the stock in base unit, lines of one product summed (RG-CMD-02)', async () => {
    // 6 cartons of 72 = 432 pieces, the whole stock, plus 1 piece: one piece short.
    const quote = await savedQuote([
      { productUnitId: units.soapCarton, qty: '6' },
      { productUnitId: units.nails, qty: '48.75' },
      { productUnitId: units.soapPiece, qty: '1' },
    ]);
    const refused = await submit(quote.id, 1);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({
      code: 'STOCK_UNAVAILABLE',
      details: {
        shortages: [
          {
            productId: ids.soap,
            sku: 'SAV-001',
            baseUnit: 'pièce',
            available: '432.00',
            requested: '433.00',
            lines: [1, 3],
          },
        ],
      },
    });
    // Nothing reserved, nothing numbered: all or nothing (RG-CMD-03).
    expect(await stock(ids.soap)).toEqual({ onHand: '432.00', reserved: '0.00' });
    expect(await stock(ids.nails)).toEqual({ onHand: '48.75', reserved: '0.00' });
    expect(await t.db.reservation.count()).toBe(0);
    const stored = await t.db.order.findUniqueOrThrow({ where: { id: quote.id } });
    expect([stored.status, stored.ticketSeq, stored.version]).toEqual(['DRAFT', null, 1]);
  });

  it('deducts what the orders already validated hold (RG-STK-01)', async () => {
    await submitted((await savedQuote([{ productUnitId: units.soapCarton, qty: '5' }])).id);
    // 432 − 360 = 72 left: 12 packs pass, 13 do not.
    const tooMany = await savedQuote([{ productUnitId: units.soapPack, qty: '13' }]);
    const refused = await submit(tooMany.id, 1);
    expect(refused.json()).toMatchObject({
      code: 'STOCK_UNAVAILABLE',
      details: { shortages: [{ available: '72.00', requested: '78.00', lines: [1] }] },
    });
    await submitted((await savedQuote([{ productUnitId: units.soapPack, qty: '12' }])).id);
    expect(await stock(ids.soap)).toEqual({ onHand: '432.00', reserved: '432.00' });
  });

  it('lets only one of two orders take the last units', async () => {
    const one = await savedQuote([{ productUnitId: units.soapCarton, qty: '4' }]);
    const other = await savedQuote(
      [{ productUnitId: units.soapCarton, qty: '4' }],
      cookies.otherSales,
    );
    const answers = await Promise.all([submit(one.id, 1), submit(other.id, 1, cookies.otherSales)]);
    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([200, 409]);
    expect(await stock(ids.soap)).toEqual({ onHand: '432.00', reserved: '288.00' });
  });

  it('refuses a price changed since the quote was saved (RG-CMD-04, ⚠️ H28)', async () => {
    const quote = await savedQuote();
    const now = new Date();
    await t.db.$transaction(async (tx) => {
      await tx.productPrice.updateMany({
        where: { productUnitId: units.nails, effectiveTo: null },
        data: { effectiveTo: now },
      });
      const { setById } = await tx.productPrice.findFirstOrThrow({
        where: { productUnitId: units.nails },
      });
      await tx.productPrice.create({
        data: {
          productUnitId: units.nails,
          price: '7000',
          effectiveFrom: now,
          source: 'MANUAL',
          setById,
        },
      });
    });
    const refused = await submit(quote.id, 1);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'ORDER_PRICE_CHANGED', details: { lines: [2] } });
    expect(await t.db.reservation.count()).toBe(0);
  });

  it('checks the caps again, as they are now (RG-REM-01/02)', async () => {
    const quote = await savedQuote();
    // The soap's category cap goes from 5 % to 2 %: the 5 % given on its line no longer fits.
    await t.db.category.update({
      where: { name: 'Savons et hygiène' },
      data: { maxDiscountPct: '2' },
    });
    const refused = await submit(quote.id, 1);
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({
      code: 'QUOTE_DISCOUNT_BEYOND_CAP',
      details: { lines: [1], order: false },
    });
  });

  it('refuses a stale version, and replays a validation to its own author only', async () => {
    const quote = await savedQuote();
    const stale = await submit(quote.id, 2);
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'QUOTE_CHANGED' });

    const order = await submitted(quote.id);
    // The answer lost on the Wi-Fi: the same tablet sending it again gets the same ticket.
    expect(await submitted(quote.id)).toEqual(order);
    const other = await submit(quote.id, 1, cookies.otherSales);
    expect(other.statusCode).toBe(409);
    expect(other.json()).toMatchObject({ code: 'QUOTE_NOT_DRAFT' });
    expect(await stock(ids.soap)).toEqual({ onHand: '432.00', reserved: '12.00' });
    expect(await auditActions(t.db, quote.id)).toEqual(['quote.created', 'order.submitted']);
  });

  it('gives the order to the salesperson who validates (RG-DEV-03, RG-CMD-01)', async () => {
    // Hery takes over Vola's quote: the order and its ticket letter are his.
    const taken = await submitted((await savedQuote()).id, 1, cookies.otherSales);
    expect(taken).toMatchObject({ salesUser: { id: ids.hery }, ticket: { letter: 'B', seq: 1 } });
    // The manager validates for the quote's salesperson, under her letter (⚠️ H28).
    const byManager = await submitted((await savedQuote()).id, 1, cookies.manager);
    expect(byManager).toMatchObject({ salesUser: { id: ids.vola }, ticket: { letter: 'A' } });
  });

  it('refuses a salesperson without a letter, and the cashier (annexe B)', async () => {
    const quote = await savedQuote();
    const noLetter = await submit(quote.id, 1, cookies.noLetter);
    expect(noLetter.statusCode).toBe(409);
    expect(noLetter.json()).toMatchObject({ code: 'TICKET_LETTER_MISSING' });
    expect((await submit(quote.id, 1, cookies.cashier)).statusCode).toBe(403);
    expect((await submit(quote.id, 0)).statusCode).toBe(400);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await submit(unknown, 1)).statusCode).toBe(404);
  });
});
