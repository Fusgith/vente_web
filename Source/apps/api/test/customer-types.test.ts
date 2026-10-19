import { customerSchema, productDetailSchema, quoteSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { productId, seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('customer types and their prices (T-093, H66)', () => {
  let t: TestApp;
  const cookies = { sales: '', manager: '' };
  let customerId: string;
  let soap: string;
  let soapPack: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' });
    cookies.sales = (
      await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })
    ).cookie;
    cookies.manager = (
      await loginOk(t.app, { username: 'responsable', role: 'manager', password: '1234' })
    ).cookie;
    const customer = await request(t.app, 'POST', '/api/v1/customers', {
      cookie: cookies.sales,
      body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
    });
    customerId = customerSchema.parse(customer.json()).id;
    soap = await productId(t.db, 'SAV-001');
    soapPack = await unitId(t.db, 'SAV-001', 'paquet');
  });

  const setType = (type: string, cookie = cookies.manager) =>
    request(t.app, 'POST', `/api/v1/customers/${customerId}/type`, { cookie, body: { type } });
  const packPrice = async () => {
    const response = await request(t.app, 'POST', '/api/v1/quotes', {
      cookie: cookies.sales,
      body: {
        customerId,
        lines: [{ productUnitId: soapPack, qty: '1', discount: null }],
        orderDiscount: null,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return quoteSchema.parse(response.json()).lines[0]?.unitPrice;
  };

  it('lets the manager set the type, audited; a salesperson may not', async () => {
    const created = await t.db.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(created.type).toBe('INDIVIDUAL');
    const changed = await setType('WHOLESALER');
    expect(changed.statusCode).toBe(200);
    expect(customerSchema.parse(changed.json()).type).toBe('WHOLESALER');
    const entry = await t.db.auditLog.findFirstOrThrow({
      where: { action: 'customer.updated', entityId: customerId },
    });
    expect(entry).toMatchObject({ before: { type: 'INDIVIDUAL' }, after: { type: 'WHOLESALER' } });
    expect((await setType('RETAILER', cookies.sales)).statusCode).toBe(403);
    expect((await setType('VIP')).statusCode).toBe(400);
  });

  it('prices a line at the price of the customer’s type, else at the base price', async () => {
    const set = await request(t.app, 'POST', `/api/v1/products/${soap}/units/${soapPack}/prices`, {
      cookie: cookies.manager,
      body: { price: '22000', customerType: 'WHOLESALER' },
    });
    expect(set.statusCode, set.body).toBe(200);
    const pack = productDetailSchema.parse(set.json()).units.find((unit) => unit.id === soapPack);
    expect(pack).toMatchObject({ price: '25000.00', typePrices: { WHOLESALER: '22000.00' } });

    expect(await packPrice()).toBe('25000.00');
    await setType('WHOLESALER');
    expect(await packPrice()).toBe('22000.00');
    await setType('RETAILER');
    expect(await packPrice()).toBe('25000.00');
  });
});
