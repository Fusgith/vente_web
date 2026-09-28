import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  customerSchema,
  invoiceLookupSchema,
  paidOrderSchema,
  quoteSchema,
  refundedOrderSchema,
  sessionSummarySchema,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { shopYear } from '../src/services/shop-time.js';
import { productId, seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('refund after payment, credit note (RG-ANN-02, ⚠️ H36)', () => {
  let t: TestApp;
  const cookies = { sales: '', soa: '', warehouse: '' };
  const ids = { customer: '', nails: '', nailsUnit: '', manager: '' };
  let methods: Record<string, string> = {};
  const year = shopYear(new Date());
  const approval = { username: 'responsable', pin: '1234' };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    ids.manager = (await seedDemoCatalog(t.db)).managerId;
    methods = await seedPaymentMethods(t.db);
    await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234', ticketLetter: 'A' });
    await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '3456' });
    await createUser(t.db, { username: 'rina', roles: ['cashier'], pin: '5678' });
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], pin: '4567' });
    cookies.sales = (await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' })).cookie;
    cookies.soa = (await loginOk(t.app, { username: 'soa', role: 'cashier', pin: '3456' })).cookie;
    cookies.warehouse = (
      await loginOk(t.app, { username: 'feno', role: 'warehouse', pin: '4567' })
    ).cookie;
    const customer = await post('/customers', cookies.sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    ids.customer = customerSchema.parse(customer.json()).id;
    ids.nails = await productId(t.db, 'CLO-001');
    ids.nailsUnit = await unitId(t.db, 'CLO-001', 'kg');
    const register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.soa, { stationId: register, openingFloat: '50000' });
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }
  const get = (url: string, cookie: string) => request(t.app, 'GET', `/api/v1${url}`, { cookie });

  /** 1 kg of nails (6 500,00 MGA) paid in cash at Soa's register: its invoice number. */
  async function paid(): Promise<{ id: string; invoice: string }> {
    const quote = await post('/quotes', cookies.sales, {
      customerId: ids.customer,
      lines: [{ productUnitId: ids.nailsUnit, qty: '1', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    await post(`/orders/${id}/call`, cookies.soa);
    const payment = await post(
      `/orders/${id}/pay`,
      cookies.soa,
      {
        version: 3,
        lines: [{ methodId: methods['CASH'], amount: '6500', reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
    return { id, invoice: paidOrderSchema.parse(payment.json()).invoice.number };
  }
  const refund = (id: string, body: object = {}) =>
    post(`/orders/${id}/refund`, cookies.soa, {
      version: 4,
      reason: 'Le client renonce',
      refund: { methodId: methods['CASH'], reference: null },
      approval,
      ...body,
    });
  const code = async (response: Awaited<ReturnType<typeof post>>) =>
    [response.statusCode, response.json().code] as const;
  const reserved = async () =>
    (
      await t.db.productStock.findUniqueOrThrow({ where: { productId: ids.nails } })
    ).reserved.toFixed(2);

  it('finds a sale by its invoice number, as the customer shows it', async () => {
    const sale = await paid();
    const found = await get(
      `/invoices/lookup?number=${` ${sale.invoice.toLowerCase()} `}`,
      cookies.soa,
    );
    expect(found.statusCode, found.body).toBe(200);
    expect(invoiceLookupSchema.parse(found.json())).toMatchObject({
      invoice: { number: sale.invoice },
      order: { id: sale.id, status: 'PAID', total: '6500.00' },
      payment: { lines: [{ method: { code: 'CASH' }, amount: '6500.00' }] },
      creditNotes: [],
    });
    expect(await code(await get('/invoices/lookup?number=F-2000-999999', cookies.soa))).toEqual([
      404,
      'INVOICE_NOT_FOUND',
    ]);
    expect((await get(`/invoices/lookup?number=${sale.invoice}`, cookies.sales)).statusCode).toBe(
      403,
    );
  });

  it('cancels a paid order with the manager’s PIN: credit note, refund, stock freed', async () => {
    const sale = await paid();
    expect(await reserved()).toBe('1.00');
    const response = await refund(sale.id);
    expect(response.statusCode, response.body).toBe(200);
    const { order, creditNote } = refundedOrderSchema.parse(response.json());
    expect(order.status).toBe('REFUNDED');
    expect(creditNote.number).toBe(`AV-${year}-000001`);

    expect(await reserved()).toBe('0.00');
    const invoice = await t.db.invoice.findFirstOrThrow({ where: { orderId: sale.id } });
    expect(invoice.status).toBe('CREDITED');
    const stored = await t.db.creditNote.findUniqueOrThrow({ where: { id: creditNote.id } });
    expect(stored).toMatchObject({
      year,
      seq: 1,
      approvedById: ids.manager,
      refundReference: null,
    });
    expect(stored.amount.toFixed(2)).toBe('6500.00');
    expect(stored.snapshot).toMatchObject({
      invoice: { number: sale.invoice },
      amount: '6500.00',
      reason: 'Le client renonce',
      refund: { method: 'Espèces', amount: '6500.00' },
      approvedBy: 'User responsable',
    });
    expect(await auditActions(t.db, sale.id)).toContain('order.refunded');
    const file = await readFile(path.join(t.filesDir, stored.pdfPath ?? 'none'));
    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    const reprint = await get(`/credit-notes/${creditNote.id}/pdf`, cookies.soa);
    expect(Buffer.compare(reprint.rawPayload, file)).toBe(0);

    // The cash went back out of Soa's drawer (RG-CAI-03).
    const summary = sessionSummarySchema.parse(
      (await get('/register-sessions/current/summary', cookies.soa)).json().summary,
    );
    expect(summary).toMatchObject({
      refunds: [{ code: 'CASH', count: 1, total: '6500.00' }],
      cashExpected: '50000.00',
    });
    // Found again by its invoice, with its credit note to reprint.
    const again = invoiceLookupSchema.parse(
      (await get(`/invoices/lookup?number=${sale.invoice}`, cookies.soa)).json(),
    );
    expect(again.creditNotes).toEqual([creditNote]);
    // Done once: the same order is no longer refundable.
    expect(await code(await refund(sale.id, { version: 5 }))).toEqual([
      409,
      'ORDER_NOT_REFUNDABLE',
    ]);
  });

  it('refuses a wrong PIN, a non-manager, a missing reference, an order taken to a counter', async () => {
    const sale = await paid();
    const wrong = await refund(sale.id, { approval: { ...approval, pin: '9999' } });
    expect(await code(wrong)).toEqual([401, 'AUTH_INVALID_CREDENTIALS']);
    expect(await auditActions(t.db, ids.manager)).toContain('auth.login_failed');
    expect(
      await code(await refund(sale.id, { approval: { username: 'rina', pin: '5678' } })),
    ).toEqual([403, 'APPROVAL_NOT_MANAGER']);
    expect(
      await code(
        await refund(sale.id, { refund: { methodId: methods['MVOLA'], reference: null } }),
      ),
    ).toEqual([422, 'REFUND_REFERENCE_REQUIRED']);
    expect(await t.db.creditNote.count()).toBe(0);

    await post('/queues/delivery/take-next', cookies.warehouse);
    expect(await code(await refund(sale.id, { version: 5 }))).toEqual([
      409,
      'ORDER_NOT_REFUNDABLE',
    ]);
  });

  it('never lets the one refunding validate their own refund (annexe B)', async () => {
    const sale = await paid();
    await createUser(t.db, { username: 'hery', roles: ['cashier', 'manager'], pin: '6789' });
    const hery = (await loginOk(t.app, { username: 'hery', role: 'cashier', pin: '6789' })).cookie;
    const register = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', hery, { stationId: register, openingFloat: '0' });
    const self = await post(`/orders/${sale.id}/refund`, hery, {
      version: 4,
      reason: 'Le client renonce',
      refund: { methodId: methods['CASH'], reference: null },
      approval: { username: 'hery', pin: '6789' },
    });
    expect(await code(self)).toEqual([403, 'APPROVAL_SELF']);
    expect(await t.db.creditNote.count()).toBe(0);
  });

  it('numbers the credit notes without a gap (RG-FAC-05)', async () => {
    const [first, second] = [await paid(), await paid()];
    await refund(first.id, { approval: { ...approval, pin: '0000' } });
    const one = refundedOrderSchema.parse((await refund(first.id)).json());
    const two = refundedOrderSchema.parse((await refund(second.id)).json());
    expect([one.creditNote.number, two.creditNote.number]).toEqual([
      `AV-${year}-000001`,
      `AV-${year}-000002`,
    ]);
  });
});
