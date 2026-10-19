import {
  customerSchema,
  orderSchema,
  orderSummaryListSchema,
  quoteSchema,
  type Order,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
import { productId, seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)(
  "the salesperson's quotes and orders: list, sent back, reactivated (RG-DEV-02/03, RG-CMD-05b/08, H56)",
  () => {
    let t: TestApp;
    const cookies = { sales: '', otherSales: '', cashier: '', otherCashier: '', manager: '' };
    const ids = { customer: '', soap: '' };
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
        ['manager', 'responsable', 'manager', '1234'],
      ] as const)
        cookies[key] = (await loginOk(t.app, { username, role, password })).cookie;
      const customer = await request(t.app, 'POST', '/api/v1/customers', {
        cookie: cookies.sales,
        body: { name: 'Rasoa Hanta', phone: '034 11 222 33' },
      });
      ids.customer = customerSchema.parse(customer.json()).id;
      ids.soap = await productId(t.db, 'SAV-001');
      units.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
      units.nails = await unitId(t.db, 'CLO-001', 'kg');
      published = [];
      vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
        published.push(...emissions);
      });
    });

    const post = (url: string, cookie: string, body?: unknown) =>
      request(t.app, 'POST', `/api/v1${url}`, { cookie, ...(body ? { body } : {}) });
    const list = async (cookie: string, query = '') => {
      const response = await request(t.app, 'GET', `/api/v1/quotes${query}`, { cookie });
      expect(response.statusCode, response.body).toBe(200);
      return orderSummaryListSchema.parse(response.json()).orders;
    };
    const reserved = async () =>
      (
        await t.db.productStock.findUniqueOrThrow({ where: { productId: ids.soap } })
      ).reserved.toFixed(2);
    const rankOf = async (id: string) =>
      (await t.db.order.findUniqueOrThrow({ where: { id } })).queueRank;

    /** 2 packs of soap and 1 kg of nails, saved by `cookie`. */
    async function savedQuote(cookie = cookies.sales) {
      const quote = await post('/quotes', cookie, {
        customerId: ids.customer,
        lines: [
          { productUnitId: units.soapPack, qty: '2', discount: null },
          { productUnitId: units.nails, qty: '1', discount: null },
        ],
        orderDiscount: null,
      });
      expect(quote.statusCode, quote.body).toBe(201);
      return quoteSchema.parse(quote.json());
    }

    async function submitted(cookie = cookies.sales): Promise<Order> {
      const { id } = await savedQuote(cookie);
      const response = await post(`/orders/${id}/submit`, cookie, { version: 1 });
      expect(response.statusCode, response.body).toBe(200);
      return orderSchema.parse(response.json());
    }

    async function atRegister(): Promise<Order> {
      await submitted();
      const called = await post('/queues/register/call-next', cookies.cashier);
      expect(called.statusCode, called.body).toBe(200);
      published = [];
      return orderSchema.parse(called.json());
    }

    async function expired(): Promise<Order> {
      const order = await submitted();
      const past = new Date(Date.now() - 3_600_000);
      await t.db.order.update({ where: { id: order.id }, data: { expiresAt: past } });
      await t.db.reservation.updateMany({
        where: { orderId: order.id },
        data: { expiresAt: past },
      });
      expect(await t.app.expiry.sweep()).toHaveLength(1);
      published = [];
      const response = await request(t.app, 'GET', `/api/v1/orders/${order.id}`, {
        cookie: cookies.sales,
      });
      return orderSchema.parse(response.json());
    }

    it('lists the open quotes and orders of the salesperson, the latest changed first', async () => {
      const quote = await savedQuote();
      const order = await submitted();
      const colleagues = await savedQuote(cookies.otherSales);

      const mine = await list(cookies.sales);
      expect(mine.map((row) => [row.number, row.status, row.ticket?.letter ?? null])).toEqual([
        [order.number, 'SUBMITTED', 'A'],
        [quote.number, 'DRAFT', null],
      ]);
      expect(mine[1]).toMatchObject({ customer: { name: 'Rasoa Hanta' }, outdated: false });

      // A colleague's quote is found by its number, whatever its case and spaces (RG-DEV-03).
      const found = await list(cookies.sales, `?number=${colleagues.number.toLowerCase()}%20`);
      expect(found.map((row) => row.id)).toEqual([colleagues.id]);
      // The manager sees everyone's.
      expect(await list(cookies.manager)).toHaveLength(3);
      // The cashier has the queue, not this list.
      const refused = await request(t.app, 'GET', '/api/v1/quotes', { cookie: cookies.cashier });
      expect(refused.statusCode).toBe(403);
    });

    it('tells a quote past its validity outdated (RG-DEV-02)', async () => {
      const quote = await savedQuote();
      const longAgo = new Date(Date.now() - 8 * 86_400_000);
      await t.db.order.update({ where: { id: quote.id }, data: { createdAt: longAgo } });
      expect(await list(cookies.sales)).toMatchObject([{ id: quote.id, outdated: true }]);
    });

    it('sends an order back to its salesperson: a quote again, its ticket kept, its stock freed', async () => {
      const order = await atRegister();
      const rank = await rankOf(order.id);
      expect(await reserved()).toBe('12.00');

      // Only the cashier who called it, or the manager.
      const other = await post(`/orders/${order.id}/send-back`, cookies.otherCashier, {
        version: order.version,
      });
      expect(other.json()).toMatchObject({ code: 'ORDER_NOT_AT_REGISTER' });

      const response = await post(`/orders/${order.id}/send-back`, cookies.cashier, {
        version: order.version,
      });
      expect(response.statusCode, response.body).toBe(200);
      const back = orderSchema.parse(response.json());
      expect(back).toMatchObject({ status: 'DRAFT', ticket: order.ticket, expiresAt: null });
      // A new number; the old one kept, replaced by it (H69).
      expect(back.number).not.toBe(order.number);
      expect(await t.db.order.findUniqueOrThrow({ where: { number: order.number } })).toMatchObject(
        { status: 'REPLACED', replacedById: order.id, ticketSeq: null },
      );
      expect(await reserved()).toBe('0.00');
      expect(await auditActions(t.db, order.id)).toContain('order.sent_back');
      expect(published.map((e) => [e.event, e.payload])).toEqual([
        ['queue.changed', { queue: 'register', orderId: order.id, change: 'sent_back' }],
        ['order.status_changed', { orderId: order.id, status: 'DRAFT' }],
      ]);

      // Validated again that day: the same ticket, its place in the queue (H56).
      const again = await post(`/orders/${order.id}/submit`, cookies.sales, {
        version: back.version,
      });
      expect(again.statusCode, again.body).toBe(200);
      expect(orderSchema.parse(again.json())).toMatchObject({
        status: 'SUBMITTED',
        ticket: order.ticket,
      });
      expect(await rankOf(order.id)).toBe(rank);
      expect(await reserved()).toBe('12.00');
    });

    it('reactivates an expired order: last in the queue, its ticket of the day kept (RG-CMD-08)', async () => {
      const order = await expired();
      expect(order.status).toBe('EXPIRED');
      const later = await submitted();

      const colleague = await post(`/orders/${order.id}/reactivate`, cookies.otherSales, {
        version: order.version,
      });
      expect(colleague.statusCode).toBe(403);

      const response = await post(`/orders/${order.id}/reactivate`, cookies.sales, {
        version: order.version,
      });
      expect(response.statusCode, response.body).toBe(200);
      const reactivated = orderSchema.parse(response.json());
      expect(reactivated).toMatchObject({ status: 'SUBMITTED', ticket: order.ticket });
      expect(await rankOf(order.id)).toBeGreaterThan((await rankOf(later.id)) ?? 0);
      expect(await auditActions(t.db, order.id)).toContain('order.reactivated');
      expect(published.map((e) => e.event)).toContain('queue.changed');

      // Sent again over the shop's Wi-Fi: the same answer, not a refusal.
      const replay = await post(`/orders/${order.id}/reactivate`, cookies.sales, {
        version: order.version,
      });
      expect(replay.statusCode, replay.body).toBe(200);
      // An order not expired is not reactivated.
      const notExpired = await post(`/orders/${later.id}/reactivate`, cookies.sales, {
        version: later.version,
      });
      expect(notExpired.json()).toMatchObject({ code: 'ORDER_NOT_EXPIRED' });
    });

    it('makes a quote again of an expired order whose price changed (H56)', async () => {
      const order = await expired();
      const now = new Date();
      await t.db.$transaction(async (tx) => {
        await tx.productPrice.updateMany({
          where: { productUnitId: units.nails, effectiveTo: null },
          data: { effectiveTo: now },
        });
        const { setById } = await tx.productPrice.findFirstOrThrow({
          where: { productUnitId: units.nails },
        });
        await tx.productPrice.create({
          data: {
            productUnitId: units.nails,
            price: '7000',
            effectiveFrom: now,
            source: 'MANUAL',
            setById,
          },
        });
      });

      const refused = await post(`/orders/${order.id}/reactivate`, cookies.sales, {
        version: order.version,
      });
      expect(refused.json()).toMatchObject({
        code: 'ORDER_PRICE_CHANGED',
        details: { lines: [2] },
      });
      const row = await t.db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row).toMatchObject({ status: 'DRAFT', queueRank: null, version: order.version + 1 });
      expect(row.number).not.toBe(order.number);
      expect(await auditActions(t.db, order.id)).toContain('order.reopened');
      expect(await auditActions(t.db, order.id)).toContain('order.replaced');
      expect(await reserved()).toBe('0.00');
    });
  },
);
