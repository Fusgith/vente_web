import { randomUUID } from 'node:crypto';

import {
  customerPurchasesSchema,
  customerSchema,
  quoteSchema,
  type CustomerPurchases,
  type Role,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

describe.skipIf(!TEST_DATABASE_URL)('a customer’s latest purchases (T-038, H47)', () => {
  let t: TestApp;
  const cookies = { sales: '', soa: '', warehouse: '', manager: '' };
  let methods: Record<string, string> = {};
  let nails = '';

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
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], password: '4567' });
    const login = async (username: string, role: Role, password: string) =>
      (await loginOk(t.app, { username, role, password })).cookie;
    cookies.sales = await login('vola', 'sales', '1234');
    cookies.soa = await login('soa', 'cashier', '3456');
    cookies.warehouse = await login('feno', 'warehouse', '4567');
    cookies.manager = await login('responsable', 'manager', '1234');
    nails = await unitId(t.db, 'CLO-001', 'kg');
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
  const read = (id: string, cookie = cookies.sales) =>
    request(t.app, 'GET', `/api/v1/customers/${id}/purchases`, { cookie });
  const purchases = async (id: string): Promise<CustomerPurchases> => {
    const response = await read(id);
    expect(response.statusCode).toBe(200);
    return customerPurchasesSchema.parse(response.json());
  };
  const customer = async (name: string, phone: string) =>
    customerSchema.parse((await post('/customers', cookies.sales, { name, phone })).json()).id;

  /** `qty` kg of nails (6 500,00 MGA the kg) paid in cash: the order's id. */
  async function paid(customerId: string, qty: number): Promise<string> {
    const quote = await post('/quotes', cookies.sales, {
      customerId,
      lines: [{ productUnitId: nails, qty: String(qty), discount: null }],
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
        lines: [{ methodId: methods['CASH'], amount: String(6500 * qty), reference: null }],
        cashReceived: null,
      },
      randomUUID(),
    );
    expect(payment.statusCode).toBe(200);
    return id;
  }

  it('lists the invoiced lines, the newest first, an unpaid quote not counted', async () => {
    const rasoa = await customer('Rasoa Hanta', '034 11 222 33');
    expect(await purchases(rasoa)).toEqual({ lines: [] });

    await paid(rasoa, 1);
    await paid(rasoa, 2);
    await post('/quotes', cookies.sales, {
      customerId: rasoa,
      lines: [{ productUnitId: nails, qty: '9', discount: null }],
      orderDiscount: null,
    });
    const { lines } = await purchases(rasoa);
    expect(lines.map((line) => line.qty)).toEqual(['2.00', '1.00']);
    expect(lines[0]).toMatchObject({ name: expect.any(String), unitLabel: 'kg' });
    expect(lines[0]?.at && lines[1]?.at && lines[0].at >= lines[1].at).toBe(true);
  });

  it('leaves out a sale refunded in full, keeps the merged record’s (RG-ANN-02)', async () => {
    const rasoa = await customer('Rasoa Hanta', '034 11 222 33');
    const twin = await customer('Rasoa H.', '034 44 555 66');
    const refunded = await paid(rasoa, 1);
    await paid(twin, 3);
    const refund = await post(`/orders/${refunded}/refund`, cookies.soa, {
      version: 4,
      reason: 'Le client renonce',
      refund: { methodId: methods['CASH'], reference: null },
      approval: { username: 'responsable', password: '1234' },
    });
    expect(refund.statusCode).toBe(200);
    expect((await purchases(rasoa)).lines).toEqual([]);

    const merge = await post(`/customers/${twin}/merge`, cookies.manager, { intoId: rasoa });
    expect(merge.statusCode).toBe(204);
    expect((await purchases(rasoa)).lines.map((line) => line.qty)).toEqual(['3.00']);
  });

  it('opens to those who read customers, not to the warehouse', async () => {
    const rasoa = await customer('Rasoa Hanta', '034 11 222 33');
    expect((await read(rasoa, cookies.warehouse)).statusCode).toBe(403);
    expect((await read(randomUUID())).statusCode).toBe(404);
    expect((await read('pas-un-id')).statusCode).toBe(400);
  });
});
