import { customerSchema, customerSearchResultSchema, type Customer } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generateTotpCode } from '../src/services/totp.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const CUSTOMERS = '/api/v1/customers';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe.skipIf(!TEST_DATABASE_URL)('customer directory (RG-DEV-04)', () => {
  let t: TestApp;
  const cookies: Record<'sales' | 'cashier' | 'manager' | 'warehouse', string> = {
    sales: '',
    cashier: '',
    manager: '',
    warehouse: '',
  };
  let salesId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    salesId = (await createUser(t.db, { username: 'vola', roles: ['sales'], password: '1234' })).id;
    await createUser(t.db, { username: 'hery', roles: ['cashier'], password: '2345' });
    await createUser(t.db, { username: 'nirina', roles: ['manager'], password: '3456' });
    await createUser(t.db, { username: 'solo', roles: ['warehouse'], password: '4567' });
    for (const [username, role, password] of [
      ['vola', 'sales', '1234'],
      ['hery', 'cashier', '2345'],
      ['nirina', 'manager', '3456'],
      ['solo', 'warehouse', '4567'],
    ] as const)
      cookies[role] = (await loginOk(t.app, { username, role, password })).cookie;
  });

  const create = (body: unknown, cookie = cookies.sales) =>
    request(t.app, 'POST', CUSTOMERS, { cookie, body });
  async function created(name: string, phone: string): Promise<Customer> {
    const response = await create({ name, phone });
    expect(response.statusCode, response.body).toBe(201);
    return customerSchema.parse(response.json());
  }
  async function search(q: string, cookie = cookies.sales) {
    const response = await request(t.app, 'GET', `${CUSTOMERS}?q=${encodeURIComponent(q)}`, {
      cookie,
    });
    expect(response.statusCode, response.body).toBe(200);
    return customerSearchResultSchema.parse(response.json());
  }
  const names = async (q: string) => (await search(q)).items.map((c) => c.name);

  it('keeps the directory from the warehouse and from anyone signed out', async () => {
    expect((await request(t.app, 'GET', `${CUSTOMERS}?q=ra`)).statusCode).toBe(401);
    const response = await request(t.app, 'GET', `${CUSTOMERS}?q=ra`, {
      cookie: cookies.warehouse,
    });
    expect(response.statusCode).toBe(403);
  });

  it('creates a customer from name and phone, stored in one form and audited', async () => {
    const customer = await created('  Rakoto   Jean ', '+261 34 12 345 67');
    expect(customer).toMatchObject({
      name: 'Rakoto Jean',
      phone: '0341234567',
      isActive: true,
      mergedIntoId: null,
    });
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { entityId: customer.id } });
    expect(audit).toMatchObject({
      action: 'customer.created',
      userId: salesId,
      activeRole: 'sales',
      after: { name: 'Rakoto Jean', phone: '0341234567' },
    });
  });

  it('refuses a missing or invalid field', async () => {
    expect((await create({ name: 'Rakoto' })).statusCode).toBe(400);
    expect((await create({ name: 'Rakoto', phone: '034 12' })).statusCode).toBe(400);
    expect((await create({ name: ' ', phone: '0341234567' })).statusCode).toBe(400);
  });

  it('offers the known record instead of a duplicate phone, however it is written', async () => {
    const known = await created('Rakoto Jean', '034 12 345 67');
    const response = await create({ name: 'Jean R.', phone: '00261341234567' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'CUSTOMER_PHONE_TAKEN',
      details: { customer: { id: known.id, name: 'Rakoto Jean' } },
    });
    expect(await t.db.customer.count()).toBe(1);
  });

  it('lets the database decide between two tablets creating the same number at once', async () => {
    const responses = await Promise.all([
      create({ name: 'Rabe', phone: '0331112233' }),
      create({ name: 'Rabe Paul', phone: '033 11 122 33' }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await t.db.customer.count()).toBe(1);
    expect(await t.db.auditLog.count({ where: { action: 'customer.created' } })).toBe(1);
  });

  it('leaves creation to the sales role', async () => {
    const response = await create({ name: 'Rabe', phone: '0331112233' }, cookies.cashier);
    expect(response.statusCode).toBe(403);
  });

  it('finds by name word prefixes, any order, without case or accents', async () => {
    await created('Rakoto Jean', '0341234567');
    await created('Rabearivelo Hélène', '0321112233');
    await created('Andry Rakotomalala', '0339998877');
    expect(await names('rako')).toEqual(['Andry Rakotomalala', 'Rakoto Jean']);
    expect(await names('JEAN rak')).toEqual(['Rakoto Jean']);
    expect(await names('helene')).toEqual(['Rabearivelo Hélène']);
    // A prefix of a word, never the middle of one.
    expect(await names('koto')).toEqual([]);
    expect(await names('r')).toEqual([]);
  });

  it('finds by phone digits anywhere, the exact number first', async () => {
    await created('Zo', '0341234567');
    await created('Aina', '0340341234');
    expect(await names('034 12 345 67')).toEqual(['Zo']);
    expect(await names('+261 34')).toEqual(['Aina', 'Zo']);
    expect(await names('0341234')).toEqual(['Aina', 'Zo']);
    expect(await names('345 67')).toEqual(['Zo']);
    const exactFirst = await created('Abel', '0331234567');
    await created('Bako', '0343312345');
    expect((await search('0331234567')).items.map((c) => c.id)).toEqual([exactFirst.id]);
  });

  it('shows 8 customers at most and asks to refine beyond', async () => {
    for (let i = 0; i < 9; i += 1) await created(`Rasoa ${i}`, `03200000${10 + i}`);
    const result = await search('rasoa');
    expect(result.items).toHaveLength(8);
    expect(result.more).toBe(true);
  });

  it('lets the cashier correct a phone, auditing only what changed', async () => {
    const customer = await created('Rakoto Jean', '0341234567');
    const response = await request(t.app, 'PATCH', `${CUSTOMERS}/${customer.id}`, {
      cookie: cookies.cashier,
      body: { name: 'Rakoto Jean', phone: '034 12 345 00' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Rakoto Jean', phone: '0341234500' });
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: 'customer.updated' } });
    expect(audit).toMatchObject({
      activeRole: 'cashier',
      before: { phone: '0341234567' },
      after: { phone: '0341234500' },
    });
  });

  it('refuses to move a customer onto a number already known', async () => {
    const first = await created('Rakoto Jean', '0341234567');
    const second = await created('Rabe', '0331112233');
    const response = await request(t.app, 'PATCH', `${CUSTOMERS}/${second.id}`, {
      cookie: cookies.sales,
      body: { phone: '+261341234567' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().details.customer.id).toBe(first.id);
  });

  it('merges a duplicate into the record that stays (manager only)', async () => {
    const kept = await created('Rakoto Jean', '0341234567');
    const duplicate = await created('Jean Rakoto', '0321234567');
    const merge = (cookie: string, id = duplicate.id, intoId = kept.id) =>
      request(t.app, 'POST', `${CUSTOMERS}/${id}/merge`, { cookie, body: { intoId } });

    expect((await merge(cookies.sales)).statusCode).toBe(403);
    expect((await merge(cookies.manager, kept.id, kept.id)).statusCode).toBe(409);
    expect((await merge(cookies.manager)).statusCode).toBe(204);

    const gone = await t.db.customer.findUniqueOrThrow({ where: { id: duplicate.id } });
    expect(gone).toMatchObject({ isActive: false, mergedIntoId: kept.id });
    expect(await names('jean')).toEqual(['Rakoto Jean']);
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: 'customer.merged' } });
    expect(audit).toMatchObject({
      entityId: duplicate.id,
      activeRole: 'manager',
      after: { isActive: false, mergedIntoId: kept.id },
    });

    // Merged records never come back, nor take another one in.
    expect((await merge(cookies.manager)).statusCode).toBe(409);
    expect((await merge(cookies.manager, kept.id, duplicate.id)).statusCode).toBe(409);
    const edit = await request(t.app, 'PATCH', `${CUSTOMERS}/${duplicate.id}`, {
      cookie: cookies.sales,
      body: { name: 'Autre' },
    });
    expect(edit.json().code).toBe('CUSTOMER_INACTIVE');
    // The record itself stays readable, pointing to the one that replaced it.
    const read = await request(t.app, 'GET', `${CUSTOMERS}/${duplicate.id}`, {
      cookie: cookies.cashier,
    });
    expect(read.json()).toMatchObject({ isActive: false, mergedIntoId: kept.id });
  });

  it('never lets two opposite merges both pass', async () => {
    const a = await created('Rakoto', '0341234567');
    const b = await created('Rakoto J.', '0321234567');
    const responses = await Promise.all([
      request(t.app, 'POST', `${CUSTOMERS}/${a.id}/merge`, {
        cookie: cookies.manager,
        body: { intoId: b.id },
      }),
      request(t.app, 'POST', `${CUSTOMERS}/${b.id}/merge`, {
        cookie: cookies.manager,
        body: { intoId: a.id },
      }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([204, 409]);
    expect(await t.db.customer.count({ where: { isActive: true } })).toBe(1);
  });

  it('deactivates instead of deleting (manager only), which frees the number', async () => {
    const customer = await created('Rakoto Jean', '0341234567');
    const deactivate = (cookie: string) =>
      request(t.app, 'POST', `${CUSTOMERS}/${customer.id}/deactivate`, { cookie });
    expect((await deactivate(cookies.cashier)).statusCode).toBe(403);
    expect((await deactivate(cookies.manager)).statusCode).toBe(204);
    expect((await deactivate(cookies.manager)).statusCode).toBe(409);
    expect(await names('rakoto')).toEqual([]);
    expect(await auditActions(t.db, customer.id)).toEqual([
      'customer.created',
      'customer.deactivated',
    ]);
    expect((await create({ name: 'Rakoto Jean', phone: '0341234567' })).statusCode).toBe(201);
  });

  it('lets the owner read the directory, remotely, without editing it', async () => {
    const customer = await created('Rakoto Jean', '0341234567');
    await createUser(t.db, {
      username: 'boss',
      roles: ['owner'],
      password: 'Boss-1234!',
      totpSecret: TOTP_SECRET,
    });
    const { cookie } = await loginOk(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
      totp: generateTotpCode(TOTP_SECRET),
      origin: 'REMOTE',
    });
    const read = await request(t.app, 'GET', `${CUSTOMERS}?q=rakoto`, { cookie, origin: 'REMOTE' });
    expect(read.statusCode).toBe(200);
    const edit = await request(t.app, 'PATCH', `${CUSTOMERS}/${customer.id}`, {
      cookie,
      origin: 'REMOTE',
      body: { name: 'Autre' },
    });
    expect(edit.statusCode).toBe(403);
  });
});
