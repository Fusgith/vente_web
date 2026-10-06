import { randomUUID } from 'node:crypto';

import {
  creditedAmount,
  customerSchema,
  invoiceLookupSchema,
  issueEntrySchema,
  orderSchema,
  queueSchema,
  quoteSchema,
  refundedOrderSchema,
  sumAmounts,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
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

describe.skipIf(!TEST_DATABASE_URL)('delivery issues and partial credit (RG-LIV-04, H37)', () => {
  let t: TestApp;
  const cookies = { sales: '', cashier: '', feno: '', tahina: '', manager: '' };
  const ids = { customer: '', soap: '', soapPack: '', oil: '', oilBottle: '' };
  let cash = '';
  let published: Emission[] = [];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    cash = (await seedPaymentMethods(t.db))['CASH'] ?? '';
    await createUser(t.db, {
      username: 'vola',
      roles: ['sales'],
      password: '1234',
      ticketLetter: 'A',
    });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], password: '4567' });
    await createUser(t.db, { username: 'tahina', roles: ['warehouse'], password: '5678' });
    for (const [key, username, role, password] of [
      ['sales', 'vola', 'sales', '1234'],
      ['cashier', 'soa', 'cashier', '3456'],
      ['feno', 'feno', 'warehouse', '4567'],
      ['tahina', 'tahina', 'warehouse', '5678'],
      ['manager', 'responsable', 'manager', '1234'],
    ] as const)
      cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
    const customer = await post('/customers', cookies.sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.soap = await productId(t.db, 'SAV-001');
    ids.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
    ids.oil = await productId(t.db, 'HUI-001');
    ids.oilBottle = await unitId(t.db, 'HUI-001', 'bouteille');
    const register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.cashier, { stationId: register, openingFloat: '0' });
    published = [];
    vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
      published.push(...emissions);
    });
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }
  const get = (url: string, cookie: string) => request(t.app, 'GET', `/api/v1${url}`, { cookie });

  /**
   * 3 packs of soap (75 000,00) and 2 bottles of oil (19 600,00), 2 000,00 off the total:
   * 92 600,00 paid, in the delivery queue.
   */
  async function paid(): Promise<string> {
    const quote = await post('/quotes', cookies.sales, {
      customerId: ids.customer,
      lines: [
        { productUnitId: ids.soapPack, qty: '3', discount: null },
        { productUnitId: ids.oilBottle, qty: '2', discount: null },
      ],
      orderDiscount: { kind: 'amount', value: '2000' },
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    await post(`/orders/${id}/call`, cookies.cashier);
    const payment = await post(
      `/orders/${id}/pay`,
      cookies.cashier,
      {
        version: 3,
        lines: [{ methodId: cash, amount: '92600', reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
    expect(payment.statusCode, payment.body).toBe(200);
    published = [];
    return id;
  }

  const take = async (cookie = cookies.feno) =>
    orderSchema.parse((await post('/queues/delivery/take-next', cookie)).json());
  const report = (id: string, version: number, lines: unknown[], cookie = cookies.feno) =>
    post(`/orders/${id}/delivery/issue`, cookie, { version, lines, note: 'Carton percé' });
  const code = (response: Awaited<ReturnType<typeof post>>) =>
    [response.statusCode, response.json().code] as const;
  const stock = async (product: string) => {
    const row = await t.db.productStock.findUniqueOrThrow({ where: { productId: product } });
    return [row.onHand.toFixed(2), row.reserved.toFixed(2)];
  };
  const issues = async () =>
    issueEntrySchema.array().parse((await get('/deliveries/issues', cookies.manager)).json());

  it('delivers in part: stock out for what was handed over, the rest credited once at the register', async () => {
    const [soapOnHand] = await stock(ids.soap);
    const [oilOnHand] = await stock(ids.oil);
    const id = await paid();
    const taken = await take();
    const reported = await report(taken.id, taken.version, [
      { position: 1, qty: '1', cause: 'MISSING' },
      { position: 2, qty: '2', cause: 'DAMAGED' },
    ]);
    expect(reported.statusCode, reported.body).toBe(200);
    expect(orderSchema.parse(reported.json()).status).toBe('ISSUE');
    expect(published).toContainEqual(
      expect.objectContaining({
        event: 'order.status_changed',
        payload: { orderId: id, status: 'ISSUE' },
      }),
    );
    // The counter is free: feno takes the next paid order.
    const next = await paid();
    expect((await take()).id).toBe(next);
    const [open] = await issues();
    expect(open?.issue).toMatchObject({ note: 'Carton percé', credit: null });
    expect(open?.issue.lines).toEqual([
      { position: 1, qty: '1', cause: 'MISSING' },
      { position: 2, qty: '2', cause: 'DAMAGED' },
    ]);

    expect(
      code(await post(`/orders/${id}/issue/deliver-partly`, cookies.feno, { version: 5 })),
    ).toEqual([403, 'AUTH_FORBIDDEN']);
    const decided = await post(`/orders/${id}/issue/deliver-partly`, cookies.manager, {
      version: open?.order.version,
    });
    expect(decided.statusCode, decided.body).toBe(200);
    expect(orderSchema.parse(decided.json()).status).toBe('DELIVERED');
    // 2 packs of the 3 went out (12 pieces); no oil did, its reservation freed.
    const [soapNow, soapReserved] = await stock(ids.soap);
    expect(Number(soapOnHand) - Number(soapNow)).toBe(12);
    expect(soapReserved).toBe('18.00'); // the next order, still at the counter
    expect(await stock(ids.oil)).toEqual([oilOnHand, '2.00']);
    const lines = await t.db.orderLine.findMany({
      where: { orderId: id },
      orderBy: { position: 'asc' },
    });
    expect(lines.map((line) => line.deliveredQty.toFixed(2))).toEqual(['2.00', '0.00']);
    const reservations = await t.db.reservation.findMany({
      where: { orderId: id },
      orderBy: { productId: 'asc' },
    });
    expect(new Set(reservations.map((row) => row.status))).toEqual(
      new Set(['CONSUMED', 'RELEASED']),
    );
    const credit = sumAmounts(
      lines.map((line, index) =>
        creditedAmount({
          qty: line.qty.toFixed(2),
          paid: line.lineTotal.minus(line.orderDiscountShare).toFixed(2),
          missing: index === 0 ? '1' : '2',
        }),
      ),
    );
    const [pending] = await issues();
    expect(pending?.issue.credit).toEqual({
      amount: credit,
      decidedBy: expect.any(String),
      creditNote: null,
    });
    expect(Number(credit)).toBeLessThan(92600);

    // At the register: the sale found by its invoice shows what is left to refund.
    const invoice = await t.db.invoice.findUniqueOrThrow({ where: { orderId: id } });
    const sale = invoiceLookupSchema.parse(
      (await get(`/invoices/lookup?number=${invoice.number}`, cookies.cashier)).json(),
    );
    expect(sale.issue?.credit?.amount).toBe(credit);
    const refund = { issueId: sale.issue?.id, refund: { methodId: cash, reference: null } };
    const refunded = await post(`/orders/${id}/partial-refund`, cookies.cashier, refund);
    expect(refunded.statusCode, refunded.body).toBe(200);
    const { creditNote } = refundedOrderSchema.parse(refunded.json());
    expect(creditNote.number).toMatch(/^AV-\d{4}-000001$/);
    expect(code(await post(`/orders/${id}/partial-refund`, cookies.cashier, refund))).toEqual([
      409,
      'CREDIT_NOT_PENDING',
    ]);
    const stored = await t.db.creditNote.findUniqueOrThrow({ where: { id: creditNote.id } });
    expect(stored.amount.toFixed(2)).toBe(credit);
    expect(stored.snapshot).toMatchObject({
      amount: credit,
      credited: [
        { qty: '1', cause: 'MISSING', unitLabel: 'paquet' },
        { qty: '2', cause: 'DAMAGED', unitLabel: 'bouteille' },
      ],
    });
    expect((await t.db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe(
      'PARTIALLY_CREDITED',
    );
    expect(await issues()).toEqual([]);
    const actions = await t.db.auditLog.findMany({
      where: { entityId: id, action: { startsWith: 'order.' } },
      select: { action: true },
    });
    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining(['order.issue', 'order.partly_delivered', 'order.partly_refunded']),
    );
    const pdf = await get(`/credit-notes/${creditNote.id}/pdf`, cookies.cashier);
    expect(pdf.statusCode).toBe(200);
  });

  it('puts the order back in the queue at its place when the goods are there', async () => {
    const id = await paid();
    const later = await paid();
    const taken = await take();
    expect(taken.id).toBe(id);
    const ready = orderSchema.parse(
      (await post(`/orders/${id}/delivery/ready`, cookies.feno)).json(),
    );
    const line = { position: 1, qty: '1', cause: 'MISSING' };
    expect(code(await report(id, ready.version, [line], cookies.tahina))).toEqual([
      409,
      'ORDER_NOT_AT_COUNTER',
    ]);
    expect(code(await report(id, ready.version, [{ ...line, qty: '4' }]))).toEqual([
      422,
      'ISSUE_LINE_INVALID',
    ]);
    expect(code(await report(id, ready.version - 1, [line]))).toEqual([409, 'ORDER_CHANGED']);
    const issue = orderSchema.parse((await report(id, ready.version, [line])).json());

    const requeued = await post(`/orders/${id}/issue/requeue`, cookies.manager, {
      version: issue.version,
    });
    expect(requeued.statusCode, requeued.body).toBe(200);
    expect(orderSchema.parse(requeued.json()).status).toBe('PAID');
    expect(
      code(
        await post(`/orders/${id}/issue/requeue`, cookies.manager, { version: issue.version + 1 }),
      ),
    ).toEqual([409, 'ORDER_NOT_IN_ISSUE']);
    const waiting = queueSchema.parse((await get('/queues/delivery', cookies.feno)).json()).waiting;
    expect(waiting.map((item) => item.orderId)).toEqual([id, later]);
    expect(await issues()).toEqual([]);

    // Taken again and handed over in full: every line delivered.
    const again = await take(cookies.tahina);
    expect(again.id).toBe(id);
    const called = orderSchema.parse(
      (await post(`/orders/${id}/delivery/ready`, cookies.tahina)).json(),
    );
    const delivered = await post(`/orders/${id}/delivery/deliver`, cookies.tahina, {
      version: called.version,
      delivered: [1, 2],
    });
    expect(delivered.statusCode, delivered.body).toBe(200);
    const lines = await t.db.orderLine.findMany({
      where: { orderId: id },
      orderBy: { position: 'asc' },
    });
    expect(lines.map((row) => row.deliveredQty.toFixed(2))).toEqual(['3.00', '2.00']);
  });

  it('never delivers in part when nothing would be handed over', async () => {
    const id = await paid();
    const taken = await take();
    const issue = orderSchema.parse(
      (
        await report(taken.id, taken.version, [
          { position: 1, qty: '3', cause: 'MISSING' },
          { position: 2, qty: '2', cause: 'MISSING' },
        ])
      ).json(),
    );
    expect(
      code(
        await post(`/orders/${id}/issue/deliver-partly`, cookies.manager, {
          version: issue.version,
        }),
      ),
    ).toEqual([409, 'ISSUE_NOTHING_DELIVERED']);
    const invoice = await t.db.invoice.findUniqueOrThrow({ where: { orderId: id } });
    const sale = invoiceLookupSchema.parse(
      (await get(`/invoices/lookup?number=${invoice.number}`, cookies.cashier)).json(),
    );
    expect(sale.issue).toBeNull();
  });
});
