import { customerSchema, customerSearchResultSchema, type Customer } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

const CUSTOMERS = '/api/v1/customers';

describe.skipIf(!TEST_DATABASE_URL)('customer directory: a second phone (RG-DEV-04, H26)', () => {
  let t: TestApp;
  let cookie = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' });
    cookie = (await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })).cookie;
  });

  const create = (body: unknown) => request(t.app, 'POST', CUSTOMERS, { cookie, body });
  async function created(name: string, phone: string): Promise<Customer> {
    const response = await create({ name, phone });
    expect(response.statusCode, response.body).toBe(201);
    return customerSchema.parse(response.json());
  }
  async function search(q: string) {
    const response = await request(t.app, 'GET', `${CUSTOMERS}?q=${encodeURIComponent(q)}`, {
      cookie,
    });
    return customerSearchResultSchema.parse(response.json());
  }
  const names = async (q: string) => (await search(q)).items.map((c) => c.name);
  const patch = (id: string, body: unknown) =>
    request(t.app, 'PATCH', `${CUSTOMERS}/${id}`, { cookie, body });

  it('keeps it, finds the customer by it, and gives each number to one customer', async () => {
    const response = await create({
      name: 'Rakoto Jean',
      phone: '034 12 345 67',
      secondPhone: '+261 32 44 555 66',
    });
    expect(response.statusCode, response.body).toBe(201);
    const known = customerSchema.parse(response.json());
    expect(known).toMatchObject({ phone: '0341234567', secondPhone: '0324455566' });
    expect(await names('32 44 555')).toEqual(['Rakoto Jean']);
    expect((await search('0324455566')).items[0]?.id).toBe(known.id);

    // Its second number as the first of another, its first as the second of another.
    for (const body of [
      { name: 'Rabe', phone: '032 44 555 66' },
      { name: 'Rabe', phone: '0331112233', secondPhone: '0341234567' },
    ]) {
      const taken = await create(body);
      expect(taken.statusCode).toBe(409);
      expect(taken.json()).toMatchObject({
        code: 'CUSTOMER_PHONE_TAKEN',
        details: { customer: { id: known.id } },
      });
    }
    const same = await create({
      name: 'Rabe',
      phone: '0331112233',
      secondPhone: '033 11 122 33',
    });
    expect(same.statusCode).toBe(400);
    expect(await t.db.customer.count()).toBe(1);
  });

  it('lets the database decide when two tablets claim one number, first and second', async () => {
    const responses = await Promise.all([
      create({ name: 'Rabe', phone: '0331112233' }),
      create({ name: 'Rasoa', phone: '0349998877', secondPhone: '0331112233' }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await t.db.customer.count()).toBe(1);
  });

  it('adds, removes and audits it; a number freed can be taken again', async () => {
    const customer = await created('Rakoto Jean', '0341234567');
    const added = await patch(customer.id, { secondPhone: '032 44 555 66' });
    expect(added.statusCode, added.body).toBe(200);
    expect(added.json()).toMatchObject({ secondPhone: '0324455566' });
    const same = await patch(customer.id, { secondPhone: '0341234567' });
    expect(same.statusCode).toBe(400);
    expect(same.json().code).toBe('CUSTOMER_PHONES_SAME');

    expect((await create({ name: 'Rabe', phone: '0324455566' })).statusCode).toBe(409);
    const removed = await patch(customer.id, { secondPhone: null });
    expect(removed.json()).toMatchObject({ secondPhone: null });
    expect((await create({ name: 'Rabe', phone: '0324455566' })).statusCode).toBe(201);

    const audits = await t.db.auditLog.findMany({
      where: { action: 'customer.updated', entityId: customer.id },
      orderBy: { id: 'asc' },
    });
    expect(audits.map((row) => [row.before, row.after])).toEqual([
      [{ secondPhone: null }, { secondPhone: '0324455566' }],
      [{ secondPhone: '0324455566' }, { secondPhone: null }],
    ]);
  });
});
