import { randomUUID } from 'node:crypto';

import {
  discountCodeSchema,
  orderSchema,
  paidOrderSchema,
  quoteSchema,
  type Order,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
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

const PASSWORD = 'Boss-1234!';

describe.skipIf(!TEST_DATABASE_URL)(
  'an owner’s code typed at the register, named on the invoice (RG-CMD-05b, RG-REM-07, H42)',
  () => {
    let t: TestApp;
    const cookies = { owner: '', sales: '', cashier: '', otherCashier: '' };
    let customer = '';
    let cash = '';
    const units = { soapPack: '', nails: '' };
    const products = { soap: '', rice: '' };
    let published: Emission[] = [];

    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      await t.reset();
      await seedDemoCatalog(t.db);
      cash = (await seedPaymentMethods(t.db))['CASH'] ?? '';
      await createUser(t.db, { username: 'boss', roles: ['owner'], password: PASSWORD });
      await createUser(t.db, {
        username: 'vola',
        roles: ['sales'],
        password: '1234',
        ticketLetter: 'A',
      });
      await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
      await createUser(t.db, { username: 'rina', roles: ['cashier'], password: '5678' });
      cookies.owner = (
        await loginOk(t.app, { username: 'boss', role: 'owner', password: PASSWORD })
      ).cookie;
      for (const [key, username, role, password] of [
        ['sales', 'vola', 'sales', '1234'],
        ['cashier', 'soa', 'cashier', '3456'],
        ['otherCashier', 'rina', 'cashier', '5678'],
      ] as const)
        cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
      customer = (
        await t.db.customer.create({ data: { name: 'Rasoa Hanta', phone: '034 11 222 33' } })
      ).id;
      units.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
      units.nails = await unitId(t.db, 'CLO-001', 'kg');
      products.soap = await productId(t.db, 'SAV-001');
      products.rice = await productId(t.db, 'RIZ-001');
      published = [];
      vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
        published.push(...emissions);
      });
    });

    const post = (url: string, cookie: string, body?: unknown, key?: string) =>
      request(t.app, 'POST', `/api/v1${url}`, {
        cookie,
        ...(body ? { body } : {}),
        ...(key ? { headers: { 'idempotency-key': key } } : {}),
      });

    /** 4 packs of soap (gross 100 000, cap 5 %) and 3 kg of nails (19 500, cap 15 %), at Soa's. */
    async function atRegister(
      soap: unknown,
      nails: unknown,
      orderDiscount: unknown,
    ): Promise<Order> {
      const quote = await post('/quotes', cookies.sales, {
        customerId: customer,
        lines: [
          { productUnitId: units.soapPack, qty: '4', discount: soap },
          { productUnitId: units.nails, qty: '3', discount: nails },
        ],
        orderDiscount,
      });
      expect(quote.statusCode, quote.body).toBe(201);
      const { id } = quoteSchema.parse(quote.json());
      const submitted = await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
      expect(submitted.statusCode, submitted.body).toBe(200);
      const called = await post('/queues/register/call-next', cookies.cashier);
      expect(called.statusCode, called.body).toBe(200);
      published = [];
      return orderSchema.parse(called.json());
    }

    /** 12 % on the soap and, unless said otherwise, 5 000 off the total. */
    async function issued(items?: unknown[]) {
      const reply = await post('/discount-codes', cookies.owner, {
        customerId: customer,
        items: items ?? [
          { productId: products.soap, discount: { kind: 'pct', value: '12' } },
          { productId: null, discount: { kind: 'amount', value: '5000' } },
        ],
      });
      expect(reply.statusCode, reply.body).toBe(201);
      return discountCodeSchema.parse(reply.json());
    }

    const attach = (
      order: Order,
      code: string,
      cookie = cookies.cashier,
      version = order.version,
    ) => post(`/orders/${order.id}/discount-code`, cookie, { code, version });

    it('applies the grants on the order before payment, and the invoice names the code', async () => {
      const order = await atRegister({ kind: 'pct', value: '5' }, null, {
        kind: 'amount',
        value: '2000',
      });
      expect(order).toMatchObject({ subtotal: '114500.00', total: '112500.00' });
      const code = await issued();

      // Typed as heard: lower case, no dash.
      const reply = await attach(order, code.code.replace('-', '').toLowerCase());

      expect(reply.statusCode, reply.body).toBe(200);
      const attached = orderSchema.parse(reply.json());
      expect(attached).toMatchObject({
        status: 'AT_REGISTER',
        version: order.version + 1,
        subtotal: '107500.00',
        orderDiscount: '5000.00',
        discountTotal: '17000.00',
        total: '102500.00',
        discountCode: { code: code.code },
      });
      expect(attached.lines).toMatchObject([
        { qty: '4', discountPct: '12.00', discountAmount: '12000.00', discountSource: 'CODE' },
        { qty: '3', discountAmount: '0.00', discountSource: 'NONE', net: '19500.00' },
      ]);
      const stored = await t.db.discountCode.findUniqueOrThrow({ where: { id: code.id } });
      expect(stored).toMatchObject({ status: 'USED', usedOnOrderId: order.id });
      const row = await t.db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row).toMatchObject({ orderDiscountSource: 'CODE', orderDiscountCodeId: code.id });
      expect(await auditActions(t.db, code.id)).toEqual([
        'discount_code.issued',
        'discount_code.used',
      ]);
      const audit = await t.db.auditLog.findFirstOrThrow({
        where: { entityId: order.id, action: 'order.adjusted' },
      });
      expect(audit.before).toMatchObject({ total: '112500.00' });
      expect(audit.after).toMatchObject({ total: '102500.00' });
      expect(published).toContainEqual({
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId: order.id, change: 'updated' },
      });

      // Paid at the new total: the invoice keeps the code with its discounts (RG-REM-07).
      const stationId = (await createStation(t.db, 'REGISTER')).id;
      await post('/register-sessions', cookies.cashier, { stationId, openingFloat: '0' });
      const paid = await post(
        `/orders/${order.id}/pay`,
        cookies.cashier,
        {
          version: attached.version,
          lines: [{ methodId: cash, amount: '102500', reference: null }],
          cashReceived: '102500',
        },
        randomUUID(),
      );
      expect(paid.statusCode, paid.body).toBe(200);
      const { invoice } = paidOrderSchema.parse(paid.json());
      const frozen = await t.db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(frozen.snapshot).toMatchObject({
        discountCode: code.code,
        totals: { discountTotal: '17000.00', total: '102500.00' },
      });
    });

    it('keeps a line it does not cover as validated, the total brought down to the headroom', async () => {
      // Soap with no discount (5 000 of headroom), nails at 10 % (975 left): 5 000 off the total.
      const order = await atRegister(
        null,
        { kind: 'pct', value: '10' },
        { kind: 'amount', value: '5000' },
      );
      const code = await issued([
        { productId: products.soap, discount: { kind: 'pct', value: '12' } },
      ]);

      const reply = await attach(order, code.code);

      // 12 % on the soap uses its headroom: only the nails' 975 is left for the total.
      expect(reply.statusCode, reply.body).toBe(200);
      const attached = orderSchema.parse(reply.json());
      expect(attached).toMatchObject({
        subtotal: '105550.00',
        orderDiscount: '975.00',
        orderDiscountPct: null,
        total: '104575.00',
      });
      expect(attached.lines[1]).toMatchObject({
        discountPct: '10.00',
        discountAmount: '1950.00',
        discountSource: 'WITHIN_CAP',
        net: '17550.00',
      });
    });

    it('refuses another register, a stale order, a code covering nothing, a second code', async () => {
      const order = await atRegister(null, null, null);
      const code = await issued();
      const refused = async (
        reply: Awaited<ReturnType<typeof attach>>,
        status: number,
        reason: string,
      ) => {
        expect(reply.statusCode, reply.body).toBe(status);
        expect(reply.json()).toMatchObject({ code: reason });
      };

      expect((await attach(order, code.code, cookies.sales)).statusCode).toBe(403);
      await refused(
        await attach(order, code.code, cookies.otherCashier),
        409,
        'ORDER_NOT_AT_REGISTER',
      );
      await refused(
        await attach(order, code.code, cookies.cashier, order.version - 1),
        409,
        'ORDER_CHANGED',
      );
      const rice = await issued([
        { productId: products.rice, discount: { kind: 'pct', value: '10' } },
      ]);
      await refused(await attach(order, rice.code), 422, 'DISCOUNT_CODE_NOTHING_COVERED');
      // Refused, nothing is used.
      expect(await t.db.discountCode.count({ where: { status: 'USED' } })).toBe(0);

      expect((await attach(order, code.code)).statusCode).toBe(200);
      // One code per order.
      const second = await issued();
      await refused(
        await attach(order, second.code, cookies.cashier, order.version + 1),
        409,
        'ORDER_HAS_CODE',
      );
      expect(await t.db.discountCode.count({ where: { status: 'USED' } })).toBe(1);
    });

    it('never makes an order free: such a code, or a line removed, refused (H50)', async () => {
      const order = await atRegister(null, null, null);
      // The whole total given away: refused, the code left active for another try.
      const all = await issued([{ productId: null, discount: { kind: 'pct', value: '100' } }]);
      const free = await attach(order, all.code);
      expect(free.statusCode, free.body).toBe(422);
      expect(free.json()).toMatchObject({ code: 'DISCOUNT_CODE_FREE_ORDER' });
      const unused = await t.db.discountCode.findUniqueOrThrow({ where: { id: all.id } });
      expect(unused).toMatchObject({ status: 'ACTIVE', usedOnOrderId: null });

      // The soap given away, the nails paid: the code goes on.
      const soap = await issued([
        { productId: products.soap, discount: { kind: 'pct', value: '100' } },
      ]);
      const attached = await attach(order, soap.code);
      expect(attached.statusCode, attached.body).toBe(200);
      const coded = orderSchema.parse(attached.json());
      expect(coded).toMatchObject({ version: order.version + 1, total: '19500.00' });

      // The nails, all that is paid, cannot go: the order would be free.
      const adjust = (qty: string | null) =>
        post(`/orders/${order.id}/adjust`, cookies.cashier, {
          version: coded.version,
          changes: [{ position: 2, qty }],
        });
      const removed = await adjust(null);
      expect(removed.statusCode, removed.body).toBe(422);
      expect(removed.json()).toMatchObject({ code: 'ORDER_TOTAL_ZERO' });
      const kept = await t.db.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { lines: true },
      });
      expect([kept.version, kept.lines.length]).toEqual([coded.version, 2]);
      // Lowered, still paid: it goes through.
      const lowered = await adjust('1');
      expect(lowered.statusCode, lowered.body).toBe(200);
      expect(orderSchema.parse(lowered.json())).toMatchObject({ total: '6500.00' });
    });
  },
);
