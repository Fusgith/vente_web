import { randomUUID } from 'node:crypto';

import {
  customerCategoriesSchema,
  customerSchema,
  customerSearchResultSchema,
  type Role,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearSettingsCache } from '../src/services/settings.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('customer categories (T-029b, H43, H49 a)', () => {
  let t: TestApp;
  const cookies = { sales: '', manager: '', warehouse: '' };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' });
    await createUser(t.db, { username: 'feno', roles: ['warehouse'], password: '4567' });
    await createUser(t.db, { username: 'responsable', roles: ['manager'], password: '1234' });
    const login = async (username: string, role: Role, password: string) =>
      (await loginOk(t.app, { username, role, password })).cookie;
    cookies.sales = await login('vola', 'sales', '1234');
    cookies.warehouse = await login('feno', 'warehouse', '4567');
    cookies.manager = await login('responsable', 'manager', '1234');
  });

  const get = (url: string, cookie = cookies.sales) =>
    request(t.app, 'GET', `/api/v1${url}`, { cookie });
  const classify = (id: string, category: string, cookie = cookies.manager) =>
    request(t.app, 'POST', `/api/v1/customers/${id}/category`, { cookie, body: { category } });
  const create = async (name: string, phone: string) =>
    customerSchema.parse(
      (
        await request(t.app, 'POST', '/api/v1/customers', {
          cookie: cookies.sales,
          body: { name, phone },
        })
      ).json(),
    );
  const names = async (query: string) =>
    customerSearchResultSchema
      .parse((await get(`/customers?${query}`)).json())
      .items.map((customer) => customer.name);

  it('classes a new customer « Divers », the shop’s list by default', async () => {
    const rasoa = await create('Rasoa Hanta', '034 11 222 33');
    expect(rasoa.category).toBe('Divers');
    const list = customerCategoriesSchema.parse((await get('/customers/categories')).json());
    expect(list.categories).toEqual(['Divers', 'Régulier', 'Gros contrat']);
    expect((await get('/customers/categories', cookies.warehouse)).statusCode).toBe(403);
  });

  it('lets the manager change the category, audited, within the list only', async () => {
    const rasoa = await create('Rasoa Hanta', '034 11 222 33');
    const changed = await classify(rasoa.id, 'Gros contrat');
    expect(changed.statusCode).toBe(200);
    expect(customerSchema.parse(changed.json()).category).toBe('Gros contrat');
    const entry = await t.db.auditLog.findFirstOrThrow({
      where: { action: 'customer.updated', entityId: rasoa.id },
    });
    expect(entry).toMatchObject({
      before: { category: 'Divers' },
      after: { category: 'Gros contrat' },
    });

    expect((await classify(rasoa.id, 'VIP')).json()).toMatchObject({
      code: 'CUSTOMER_CATEGORY_UNKNOWN',
    });
    expect((await classify(rasoa.id, 'Régulier', cookies.sales)).statusCode).toBe(403);
    expect((await classify(randomUUID(), 'Régulier')).statusCode).toBe(404);

    // The admin's own list replaces the default one.
    await t.db.setting.create({ data: { key: 'customer_categories', value: ['Divers', 'VIP'] } });
    clearSettingsCache();
    expect((await classify(rasoa.id, 'VIP')).statusCode).toBe(200);
  });

  it('filters the directory by category, alone or with a search', async () => {
    const rasoa = await create('Rasoa Hanta', '034 11 222 33');
    await create('Rasoa Miora', '034 44 555 66');
    await create('Rabe Jean', '033 12 345 67');
    await classify(rasoa.id, 'Régulier');

    expect(await names('category=Divers')).toEqual(['Rabe Jean', 'Rasoa Miora']);
    expect(await names('q=rasoa&category=Divers')).toEqual(['Rasoa Miora']);
    expect(await names('q=rasoa')).toEqual(['Rasoa Hanta', 'Rasoa Miora']);
    expect(await names('q=r&category=Divers')).toEqual([]);
    expect((await get('/customers')).statusCode).toBe(400);
  });
});
