import { customerSchema, orderSchema, quoteSchema, type Order } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
import { productId, seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditEntries,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)(
  'register control: lower, remove, cancel (RG-CMD-05b, RG-ANN-01)',
  () => {
    let t: TestApp;
    const cookies = { sales: '', otherSales: '', cashier: '', otherCashier: '' };
    const ids = { customer: '', soap: '', nails: '' };
    const units = { soapPack: '', nails: '' };
    let published: Emission[] = [];

    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      await t.reset();
      await seedDemoCatalog(t.db);
      await createUser(t.db, {
        username: 'vola',
        roles: ['sales'],
        password: '1234',
        ticketLetter: 'A',
      });
      await createUser(t.db, {
        username: 'hery',
        roles: ['sales'],
        password: '2345',
        ticketLetter: 'B',
      });
      await createUser(t.db, { username: 'soa', roles: ['cashier'], password: '3456' });
      await createUser(t.db, { username: 'rina', roles: ['cashier'], password: '5678' });
      for (const [key, username, role, password] of [
        ['sales', 'vola', 'sales', '1234'],
        ['otherSales', 'hery', 'sales', '2345'],
        ['cashier', 'soa', 'cashier', '3456'],
        ['otherCashier', 'rina', 'cashier', '5678'],
      ] as const)
        cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
      const customer = await request(t.app, 'POST', '/api/v1/customers', {
        cookie: cookies.sales,
        body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
      });
      ids.customer = customerSchema.parse(customer.json()).id;
      ids.soap = await productId(t.db, 'SAV-001');
      ids.nails = await productId(t.db, 'CLO-001');
      units.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
      units.nails = await unitId(t.db, 'CLO-001', 'kg');
      published = [];
      vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
        published.push(...emissions);
      });
    });

    const post = (url: string, cookie: string, body?: unknown) =>
      request(t.app, 'POST', `/api/v1${url}`, { cookie, ...(body ? { body } : {}) });

    /**
     * 4 packs of soap at 5 % (their whole cap), 3 kg of nails (cap 15 %), and `orderDiscount` on
     * the total: validated, then called to Soa's register unless `call` is false.
     */
    async function orderAtRegister(orderDiscount: unknown, call = true): Promise<Order> {
      const quote = await post('/quotes', cookies.sales, {
        customerId: ids.customer,
        lines: [
          { productUnitId: units.soapPack, qty: '4', discount: { kind: 'pct', value: '5' } },
          { productUnitId: units.nails, qty: '3', discount: null },
        ],
        orderDiscount,
      });
      const { id } = quoteSchema.parse(quote.json());
      const submitted = await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
      expect(submitted.statusCode, submitted.body).toBe(200);
      if (!call) return orderSchema.parse(submitted.json());
      const called = await post('/queues/register/call-next', cookies.cashier);
      expect(called.statusCode, called.body).toBe(200);
      published = [];
      return orderSchema.parse(called.json());
    }

    const reserved = async (product: string) =>
      (
        await t.db.productStock.findUniqueOrThrow({ where: { productId: product } })
      ).reserved.toFixed(2);
    const adjust = (order: Order, changes: unknown, cookie = cookies.cashier) =>
      post(`/orders/${order.id}/adjust`, cookie, { version: order.version, changes });

    it('lowers a quantity: its discount follows at the same rate, the stock freed (H30)', async () => {
      const order = await orderAtRegister({ kind: 'amount', value: '2000' });
      expect(order).toMatchObject({ subtotal: '114500.00', total: '112500.00' });
      expect(await reserved(ids.soap)).toBe('24.00');

      const response = await adjust(order, [{ position: 1, qty: '2' }]);
      expect(response.statusCode, response.body).toBe(200);
      const adjusted = orderSchema.parse(response.json());
      expect(adjusted.lines).toMatchObject([
        { position: 1, qty: '2', discountPct: '5.00', discountAmount: '2500.00', net: '47500.00' },
        { position: 2, qty: '3', discountAmount: '0.00', net: '19500.00' },
      ]);
      // 2 000 off the total still fits the nails' headroom (15 % of 19 500).
      expect(adjusted).toMatchObject({
        version: order.version + 1,
        subtotal: '67000.00',
        orderDiscount: '2000.00',
        total: '65000.00',
      });
      expect(await reserved(ids.soap)).toBe('12.00');
      expect(await reserved(ids.nails)).toBe('3.00');
      const line = await t.db.orderLine.findFirstOrThrow({
        where: { orderId: order.id, position: 1 },
      });
      expect(line.baseQty.toFixed(2)).toBe('12.00');
      const audit = await t.db.auditLog.findFirstOrThrow({ where: { action: 'order.adjusted' } });
      expect(audit.before).toMatchObject({ total: '112500.00' });
      expect(audit.after).toMatchObject({ total: '65000.00' });
      expect(published).toContainEqual({
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId: order.id, change: 'updated' },
      });
    });

    it('removes a line: the rest renumbered, its reservation freed, the total discount capped (H30)', async () => {
      const order = await orderAtRegister({ kind: 'amount', value: '2000' });
      const response = await adjust(order, [{ position: 2, qty: null }]);
      expect(response.statusCode, response.body).toBe(200);
      const adjusted = orderSchema.parse(response.json());
      expect(adjusted.lines.map((line) => [line.position, line.sku])).toEqual([[1, 'SAV-001']]);
      // The soap's cap is used up by its own discount: nothing is left for the total.
      expect(adjusted).toMatchObject({ orderDiscount: '0.00', total: '95000.00' });
      expect(await reserved(ids.nails)).toBe('0.00');
      const released = await t.db.reservation.findFirstOrThrow({
        where: { orderId: order.id, productId: ids.nails },
      });
      expect(released.status).toBe('RELEASED');
    });

    it('keeps a total discount typed as a rate at its rate, within the headroom', async () => {
      const order = await orderAtRegister({ kind: 'pct', value: '2' });
      const adjusted = orderSchema.parse((await adjust(order, [{ position: 1, qty: '2' }])).json());
      // 47 500 + 19 500 = 67 000; 2 % = 1 340, within the nails' 2 925 of headroom.
      expect(adjusted).toMatchObject({
        subtotal: '67000.00',
        orderDiscountPct: '2.00',
        orderDiscount: '1340.00',
        total: '65660.00',
      });
      // 2 kg of nails leave 1 950 of headroom: 2 % of 60 500 (1 210) still fits…
      const smaller = orderSchema.parse(
        (await adjust(adjusted, [{ position: 2, qty: '2' }])).json(),
      );
      expect(smaller).toMatchObject({ orderDiscountPct: '2.00', orderDiscount: '1210.00' });
    });

    it('refuses an increase, the last line, a stale version, another register', async () => {
      const order = await orderAtRegister(null);
      const code = async (response: Awaited<ReturnType<typeof adjust>>) =>
        [response.statusCode, response.json().code] as const;

      expect(await code(await adjust(order, [{ position: 2, qty: '4' }]))).toEqual([
        409,
        'ORDER_NOT_ADJUSTABLE',
      ]);
      expect(
        await code(
          await adjust(order, [
            { position: 1, qty: null },
            { position: 2, qty: null },
          ]),
        ),
      ).toEqual([409, 'ORDER_LAST_LINE']);
      expect(
        await code(await adjust(order, [{ position: 1, qty: '1' }], cookies.otherCashier)),
      ).toEqual([409, 'ORDER_NOT_AT_REGISTER']);
      expect((await adjust(order, [{ position: 1, qty: '1' }], cookies.sales)).statusCode).toBe(
        403,
      );
      expect((await adjust(order, [{ position: 1, qty: '3' }])).statusCode).toBe(200);
      expect(await code(await adjust(order, [{ position: 1, qty: '2' }]))).toEqual([
        409,
        'ORDER_CHANGED',
      ]);
    });

    it('cancels before payment with a reason, freeing the stock and the register (RG-ANN-01)', async () => {
      const order = await orderAtRegister(null);
      const cancel = (body: unknown, cookie = cookies.cashier) =>
        post(`/orders/${order.id}/cancel`, cookie, body);

      expect((await cancel({ version: order.version })).statusCode).toBe(400);
      const response = await cancel({ version: order.version, reason: 'Le client renonce' });
      expect(response.statusCode, response.body).toBe(200);
      expect(orderSchema.parse(response.json()).status).toBe('CANCELLED');
      expect(await reserved(ids.soap)).toBe('0.00');
      expect(await reserved(ids.nails)).toBe('0.00');
      expect(await auditEntries(t.db)).toContainEqual(['order.cancelled', 'Le client renonce']);
      expect(published).toContainEqual({
        rooms: ['role:manager', 'role:owner', expect.stringMatching(/^user:/)],
        event: 'order.status_changed',
        payload: { orderId: order.id, status: 'CANCELLED' },
      });
      // The register is free again, and a cancelled order stays so.
      expect((await post('/queues/register/call-next', cookies.cashier)).json().code).toBe(
        'QUEUE_EMPTY',
      );
      const again = await cancel({ version: order.version + 1, reason: 'Encore' });
      expect(again.json().code).toBe('ORDER_NOT_CANCELLABLE');
    });

    it('lets the salesperson cancel their own orders only', async () => {
      const order = await orderAtRegister(null, false);
      const body = { version: order.version, reason: 'Erreur de saisie' };
      expect((await post(`/orders/${order.id}/cancel`, cookies.otherSales, body)).statusCode).toBe(
        403,
      );
      const own = await post(`/orders/${order.id}/cancel`, cookies.sales, body);
      expect(own.statusCode, own.body).toBe(200);
      expect(await reserved(ids.soap)).toBe('0.00');
    });
  },
);
