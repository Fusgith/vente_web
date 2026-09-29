import { discountCodeListSchema, discountCodeSchema, type DiscountCode } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { expireDiscountCodes, listDiscountCodes } from '../src/services/discount-codes.js';
import { nextShopTime } from '../src/services/shop-time.js';
import { productId, seedDemoCatalog } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const PASSWORD = 'Boss-1234!';
/** Two groups of 4, none of 0, O, 1, I, L (H41). */
const READABLE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;
const HOUR = 3_600_000;

describe.skipIf(!TEST_DATABASE_URL)('discount codes issued by the owner (RG-REM-04, H41)', () => {
  let t: TestApp;
  let owner = '';
  let sales = '';
  let customer = '';
  let soap = '';
  let nails = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'boss', roles: ['owner'], password: PASSWORD });
    await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234', ticketLetter: 'A' });
    owner = (await loginOk(t.app, { username: 'boss', role: 'owner', password: PASSWORD })).cookie;
    sales = (await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' })).cookie;
    customer = (
      await t.db.customer.create({ data: { name: 'Rasoa Hanta', phone: '034 11 222 33' } })
    ).id;
    soap = await productId(t.db, 'SAV-001');
    nails = await productId(t.db, 'CLO-001');
  });

  const issue = (body: unknown, cookie = owner) =>
    request(t.app, 'POST', '/api/v1/discount-codes', { cookie, body });
  const issued = async (body: unknown): Promise<DiscountCode> => {
    const reply = await issue(body);
    expect(reply.statusCode).toBe(201);
    return discountCodeSchema.parse(reply.json());
  };
  const revoke = (id: string) =>
    request(t.app, 'POST', `/api/v1/discount-codes/${id}/revoke`, { cookie: owner });
  const grants = () => ({
    customerId: customer,
    items: [
      { productId: null, discount: { kind: 'amount', value: '5000' } },
      { productId: soap, discount: { kind: 'pct', value: '12' } },
      { productId: nails, discount: { kind: 'amount', value: '1500.50' } },
    ],
  });

  it('issues a readable code for a customer, valid until the day end, and lists it', async () => {
    const code = await issued(grants());

    expect(code.code).toMatch(READABLE);
    expect(code).toMatchObject({
      status: 'ACTIVE',
      customer: { id: customer, name: 'Rasoa Hanta', phone: '034 11 222 33' },
      orderId: null,
      usedAt: null,
      revokedAt: null,
    });
    expect(code.expiresAt).toBe(nextShopTime(new Date(code.issuedAt), '23:59').toISOString());
    expect(code.items.map((item) => [item.product?.sku ?? null, item.discount])).toEqual([
      ['CLO-001', { kind: 'amount', value: '1500.50' }],
      ['SAV-001', { kind: 'pct', value: '12.00' }],
      [null, { kind: 'amount', value: '5000.00' }],
    ]);
    const entry = await t.db.auditLog.findFirstOrThrow({ where: { entityId: code.id } });
    expect(entry).toMatchObject({ action: 'discount_code.issued', entityType: 'discount_code' });
    expect(entry.after).toMatchObject({ customerId: customer, expiresAt: code.expiresAt });

    const list = await request(t.app, 'GET', '/api/v1/discount-codes', { cookie: owner });
    expect(discountCodeListSchema.parse(list.json()).items.map((item) => item.id)).toEqual([
      code.id,
    ]);
    // The owner alone issues and reads them (annexe B).
    expect((await issue(grants(), sales)).statusCode).toBe(403);
    expect(
      (await request(t.app, 'GET', '/api/v1/discount-codes', { cookie: sales })).statusCode,
    ).toBe(403);
  });

  it('refuses a code for nothing, twice the same product, or an unavailable one', async () => {
    const item = (productId: string | null, value = '10') => ({
      productId,
      discount: { kind: 'pct', value },
    });
    expect((await issue({ customerId: customer, items: [] })).statusCode).toBe(400);
    expect((await issue({ customerId: customer, items: [item(soap, '0')] })).statusCode).toBe(400);
    expect(
      (await issue({ customerId: customer, items: [item(soap), item(soap, '5')] })).statusCode,
    ).toBe(400);
    expect(
      (await issue({ customerId: customer, items: [item(null), item(null, '5')] })).statusCode,
    ).toBe(400);

    await t.db.product.update({ where: { id: nails }, data: { isActive: false } });
    const unavailable = await issue({ customerId: customer, items: [item(nails)] });
    expect([unavailable.statusCode, unavailable.json().code]).toEqual([
      422,
      'DISCOUNT_CODE_PRODUCT_UNAVAILABLE',
    ]);
    await t.db.customer.update({ where: { id: customer }, data: { isActive: false } });
    const inactive = await issue({ customerId: customer, items: [item(soap)] });
    expect([inactive.statusCode, inactive.json().code]).toEqual([409, 'CUSTOMER_INACTIVE']);
    expect(await t.db.discountCode.count()).toBe(0);
  });

  it('revokes an active code once, and expires the others at the day end', async () => {
    const kept = await issued(grants());
    const withdrawn = await issued({
      customerId: customer,
      items: [{ productId: soap, discount: { kind: 'pct', value: '8' } }],
    });

    const revoked = await revoke(withdrawn.id);
    expect(revoked.statusCode).toBe(200);
    expect(discountCodeSchema.parse(revoked.json())).toMatchObject({ status: 'REVOKED' });
    const again = await revoke(withdrawn.id);
    expect([again.statusCode, again.json().code]).toEqual([409, 'DISCOUNT_CODE_NOT_ACTIVE']);
    expect(await auditActions(t.db, withdrawn.id)).toEqual([
      'discount_code.issued',
      'discount_code.revoked',
    ]);

    const end = new Date(kept.expiresAt);
    expect(await expireDiscountCodes(t.db, new Date(end.getTime() - 60_000))).toBe(0);
    expect(await expireDiscountCodes(t.db, end)).toBe(1);
    const expiry = await t.db.auditLog.findFirstOrThrow({
      where: { entityId: kept.id, action: 'discount_code.expired' },
    });
    expect([expiry.userId, expiry.after]).toEqual([null, { status: 'EXPIRED' }]);
    expect((await revoke(kept.id)).statusCode).toBe(409);
    // The next shop day, yesterday's codes are gone from the list: none is active any more.
    expect(await listDiscountCodes(t.db, new Date(end.getTime() + 2 * HOUR))).toEqual([]);
  });
});
