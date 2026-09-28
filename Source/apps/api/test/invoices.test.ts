import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { customerSchema, paidOrderSchema, quoteSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearSettingsCache } from '../src/services/settings.js';
import { shopYear } from '../src/services/shop-time.js';
import { seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('invoice issued with the payment (RG-FAC-01 à 04, H33)', () => {
  let t: TestApp;
  let sales = '';
  let customerId = '';
  let nails = '';
  let cash = '';
  const year = shopYear(new Date());

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
      pin: '1234',
      ticketLetter: 'A',
    });
    sales = (await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' })).cookie;
    const customer = await post('/customers', sales, {
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
    });
    customerId = customerSchema.parse(customer.json()).id;
    nails = await unitId(t.db, 'CLO-001', 'kg');
  });

  function post(url: string, cookie: string, body?: unknown, key?: string) {
    return request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });
  }

  let cashiers = 0;
  /** A cashier of their own register, with 1 kg of nails (6 500,00 MGA) called to it. */
  async function atRegister() {
    cashiers += 1;
    const username = `caisse${cashiers}`;
    await createUser(t.db, { username, roles: ['cashier'], pin: '3456' });
    const cookie = (await loginOk(t.app, { username, role: 'cashier', pin: '3456' })).cookie;
    const stationId = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookie, { stationId, openingFloat: '0' });
    const quote = await post('/quotes', sales, {
      customerId,
      lines: [{ productUnitId: nails, qty: '1', discount: null }],
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    await post(`/orders/${id}/submit`, sales, { version: 1 });
    const called = await post(`/orders/${id}/call`, cookie);
    expect(called.statusCode, called.body).toBe(200);
    return { id, cookie, version: 3 };
  }

  const pay = (order: { id: string; cookie: string; version: number }, amount = '6500') =>
    post(
      `/orders/${order.id}/pay`,
      order.cookie,
      {
        version: order.version,
        lines: [{ methodId: cash, amount, reference: null }],
        cashReceived: '10000',
      },
      randomUUID(),
    );

  it('numbers the invoice, freezes its content and stores its PDF', async () => {
    const order = await atRegister();
    const response = await pay(order);
    expect(response.statusCode, response.body).toBe(200);
    const { invoice, payment } = paidOrderSchema.parse(response.json());
    expect(invoice.number).toBe(`F-${year}-000001`);

    const stored = await t.db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored).toMatchObject({ year, seq: 1, orderId: order.id, status: 'ISSUED' });
    expect(stored.snapshot).toMatchObject({
      number: invoice.number,
      order: { ticket: 'A1' },
      cashier: 'User caisse1',
      customer: { name: 'Rasoa Hanta', phone: '0341122233' },
      lines: [{ sku: 'CLO-001', qty: '1', net: '6500.00' }],
      totals: { total: '6500.00' },
      vat: null,
      payment: {
        lines: [{ method: 'Espèces', reference: null, amount: '6500.00' }],
        cashReceived: '10000.00',
        change: '3500.00',
      },
    });
    expect((await t.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).invoiceId).toBe(
      invoice.id,
    );

    // Written at issue, sent as is at every reprint (RG-FAC-04).
    expect(stored.pdfPath).toBe(path.join('invoices', String(year), `${invoice.number}.pdf`));
    const file = await readFile(path.join(t.filesDir, stored.pdfPath ?? ''));
    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    const reprint = await request(t.app, 'GET', `/api/v1/invoices/${invoice.id}/pdf`, {
      cookie: order.cookie,
    });
    expect(reprint.statusCode).toBe(200);
    expect(reprint.headers['content-disposition']).toBe(`inline; filename="${invoice.number}.pdf"`);
    expect(Buffer.compare(reprint.rawPayload, file)).toBe(0);
    const refused = await request(t.app, 'GET', `/api/v1/invoices/${invoice.id}/pdf`, {
      cookie: sales,
    });
    expect(refused.statusCode).toBe(403);
  });

  it('makes a lost file again once, from the frozen content', async () => {
    const order = await atRegister();
    const { invoice } = paidOrderSchema.parse((await pay(order)).json());
    const stored = await t.db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    await rm(path.join(t.filesDir, stored.pdfPath ?? ''));
    const get = () =>
      request(t.app, 'GET', `/api/v1/invoices/${invoice.id}/pdf`, { cookie: order.cookie });
    const first = await get();
    expect(first.statusCode).toBe(200);
    // Kept this time: the next reprint is the very same file.
    expect(Buffer.compare((await get()).rawPayload, first.rawPayload)).toBe(0);
  });

  it('never skips a number: concurrent payments, one refused, one failing late (RG-FAC-01)', async () => {
    const orders = await Promise.all([1, 2, 3, 4].map(() => atRegister()));
    const [first, ...rest] = orders;
    // Refused on its lines: it takes no number.
    expect((await pay(first!, '6000')).statusCode).toBe(422);
    // Failing after the number was taken: the whole payment is rolled back, number included.
    await t.db.$executeRawUnsafe(`
      CREATE FUNCTION test_fail_payment() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test failure'; END $$;
      CREATE TRIGGER test_fail_payment BEFORE INSERT ON payments
        FOR EACH ROW EXECUTE FUNCTION test_fail_payment();`);
    try {
      expect((await pay(first!)).statusCode).toBe(500);
    } finally {
      await t.db.$executeRawUnsafe(
        'DROP TRIGGER test_fail_payment ON payments; DROP FUNCTION test_fail_payment();',
      );
    }

    const answers = await Promise.all(orders.map((order) => pay(order)));
    expect(answers.map((answer) => answer.statusCode)).toEqual([200, 200, 200, 200]);
    const seqs = (
      await t.db.invoice.findMany({ select: { seq: true }, orderBy: { seq: 'asc' } })
    ).map((invoice) => invoice.seq);
    expect(seqs).toEqual([1, 2, 3, 4]);
    expect(rest).toHaveLength(3);
  });

  it('breaks the VAT down when on, prints the notice when off (RG-FAC-03)', async () => {
    const setting = async (key: string, value: string | number | boolean) => {
      await t.db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      clearSettingsCache();
    };
    await setting('vat_notice', 'TVA non applicable');
    const off = paidOrderSchema.parse((await pay(await atRegister())).json());
    expect(
      (await t.db.invoice.findUniqueOrThrow({ where: { id: off.invoice.id } })).snapshot,
    ).toMatchObject({ vat: null, vatNotice: 'TVA non applicable' });

    await setting('vat_enabled', true);
    await setting('vat_rate', 20);
    await setting('invoice_prefix', 'FAC');
    const on = paidOrderSchema.parse((await pay(await atRegister())).json());
    expect(on.invoice.number).toBe(`FAC-${year}-000002`);
    expect(
      (await t.db.invoice.findUniqueOrThrow({ where: { id: on.invoice.id } })).snapshot,
    ).toMatchObject({
      vat: { rate: '20', base: '5416.67', vat: '1083.33' },
      vatNotice: '',
      totals: { total: '6500.00' },
    });
  });
});
