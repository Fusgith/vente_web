import { randomUUID } from 'node:crypto';

import {
  discountReasonsSchema,
  discountRequestListSchema,
  orderSchema,
  queueSchema,
  quoteSchema,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import { auditActions, createTestApp, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)(
  'exceptional discounts asked of the owner (RG-REM-03/05, H51, H52, H54)',
  () => {
    let t: TestApp;
    let s: DiscountScene;

    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      s = await discountScene(t);
    });

    const get = (url: string, cookie: string) => request(t.app, 'GET', `/api/v1${url}`, { cookie });
    const refused = (
      reply: { statusCode: number; body: string; json: () => unknown },
      status: number,
      reason: string,
    ) => {
      expect(reply.statusCode, reply.body).toBe(status);
      expect(reply.json()).toMatchObject({ code: reason });
    };

    it('asks from a quote: the quote shows the request, the owner and the manager are told', async () => {
      const reasons = await get('/discount-requests/reasons', s.cookies.sales);
      expect(discountReasonsSchema.parse(reasons.json()).reasons).toContain('Client fidèle');
      const quote = await s.quote();

      const reply = await s.ask(
        quote,
        [
          [null, 'amount', '5000'],
          [s.products.soap, 'pct', '20'],
        ],
        s.cookies.sales,
        { note: 'Client depuis dix ans' },
      );

      expect(reply.statusCode, reply.body).toBe(201);
      const order = orderSchema.parse(reply.json());
      // A payment or a code typed meanwhile is refused: the version moves on.
      expect(order).toMatchObject({ status: 'DRAFT', version: 2, total: '119500.00' });
      expect(order.discountRequest).toMatchObject({
        status: 'PENDING',
        reason: 'Client fidèle',
        note: 'Client depuis dix ans',
        requestedBy: { id: s.ids.vola },
        closedAt: null,
        // Products by code, the total last.
        items: [
          {
            product: { sku: 'SAV-001' },
            requested: { kind: 'pct', value: '20.00' },
            granted: null,
          },
          { product: null, requested: { kind: 'amount', value: '5000.00' }, granted: null },
        ],
      });
      const read = await get(`/quotes/${quote.id}`, s.cookies.sales);
      expect(quoteSchema.parse(read.json()).discountRequest).toEqual(order.discountRequest);
      expect(s.published).toEqual([
        {
          rooms: ['role:owner', 'role:manager'],
          event: 'discount.request_created',
          payload: { requestId: order.discountRequest?.id, orderId: quote.id },
        },
      ]);
      const audit = await t.db.auditLog.findFirstOrThrow({
        where: { action: 'discount_request.created' },
      });
      expect(audit).toMatchObject({ entityId: order.discountRequest?.id, reason: 'Client fidèle' });
    });

    it('refuses a request out of place, stale, unknown, off the order, twice, or after a code', async () => {
      const quote = await s.quote();
      const soap: [string, 'pct', string] = [s.products.soap, 'pct', '20'];

      refused(await s.ask(quote, [soap], s.cookies.otherSales), 403, 'AUTH_FORBIDDEN');
      refused(await s.ask(quote, [soap], s.cookies.cashier), 409, 'DISCOUNT_REQUEST_NOT_ALLOWED');
      expect((await s.ask(quote, [soap], s.cookies.owner)).statusCode).toBe(403);
      refused(await s.ask(quote, [soap], s.cookies.sales, { version: 2 }), 409, 'QUOTE_CHANGED');
      refused(
        await s.ask(quote, [soap], s.cookies.sales, { reason: 'Parce que' }),
        400,
        'DISCOUNT_REASON_UNKNOWN',
      );
      refused(
        await s.ask(quote, [[s.products.rice, 'pct', '10']]),
        422,
        'DISCOUNT_REQUEST_PRODUCT_INVALID',
      );
      // The same product twice: the schema refuses it.
      expect((await s.ask(quote, [soap, soap])).statusCode).toBe(400);
      expect(await t.db.discountRequest.count()).toBe(0);

      const pending = await s.asked(quote, [soap]);
      refused(await s.ask(pending, [soap]), 409, 'DISCOUNT_REQUEST_PENDING');

      // A request granted: its grants are the owner's answer already (H42, H53).
      const other = await s.asked(await s.quote(), [soap]);
      const [item] = other.discountRequest?.items ?? [];
      const granted = s.decided(
        await s.grant(other.discountRequest?.id ?? '', [[item?.id ?? '', soap]]),
      );
      refused(await s.ask(granted.order, [soap]), 409, 'QUOTE_HAS_CODE');
      expect(await t.db.discountRequest.count()).toBe(2);
    });

    it('keeps the quote from another customer while the owner decides (H52)', async () => {
      const quote = await s.quote();
      const pending = await s.asked(quote, [[s.products.soap, 'pct', '20']]);
      const other = await t.db.customer.create({
        data: { name: 'Rakoto', phone: '034 22 333 44' },
      });
      const save = (customerId: string, qty: string) =>
        request(t.app, 'PUT', `/api/v1/quotes/${quote.id}`, {
          cookie: s.cookies.sales,
          body: {
            version: pending.version,
            customerId,
            lines: [
              { productUnitId: s.units.soapPack, qty, discount: null },
              { productUnitId: s.units.nails, qty: '3', discount: null },
            ],
            orderDiscount: null,
          },
        });
      refused(await save(other.id, '4'), 409, 'DISCOUNT_REQUEST_PENDING');
      // The lines may change: the owner decides on what is left.
      const saved = await save(s.ids.customer, '5');
      expect(saved.statusCode, saved.body).toBe(200);
      expect(quoteSchema.parse(saved.json()).discountRequest?.status).toBe('PENDING');
      // Validated meanwhile: the request follows the order into the queue.
      const submitted = await s.post(`/orders/${quote.id}/submit`, s.cookies.sales, {
        version: pending.version + 1,
      });
      expect(submitted.statusCode, submitted.body).toBe(200);
    });

    it('the queue shows the order awaiting the owner, « call next » skips it until withdrawn', async () => {
      const first = await s.submitted();
      const second = await s.submitted();
      s.published.length = 0;
      await s.asked(first, [[null, 'pct', '10']]);
      expect(s.published).toContainEqual({
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId: first.id, change: 'updated' },
      });
      const queue = queueSchema.parse((await get('/queues/register', s.cookies.cashier)).json());
      expect(queue.waiting.map((item) => [item.orderId, item.discountPending])).toEqual([
        [first.id, true],
        [second.id, false],
      ]);

      const called = await s.post('/queues/register/call-next', s.cookies.cashier);
      expect(orderSchema.parse(called.json()).id).toBe(second.id);
      refused(
        await s.post('/queues/register/call-next', s.cookies.otherCashier),
        409,
        'QUEUE_EMPTY',
      );

      // Withdrawn by Vola who asked: the order is called again.
      const requestId = (await t.db.discountRequest.findFirstOrThrow()).id;
      s.published.length = 0;
      const withdrawn = await s.post(`/discount-requests/${requestId}/withdraw`, s.cookies.sales);
      expect(withdrawn.statusCode, withdrawn.body).toBe(200);
      expect(orderSchema.parse(withdrawn.json()).discountRequest).toMatchObject({
        status: 'WITHDRAWN',
      });
      expect(s.published).toContainEqual({
        rooms: ['role:owner', 'role:manager', `user:${s.ids.vola}`, 'queue:register'],
        event: 'discount.request_decided',
        payload: { requestId, orderId: first.id, status: 'WITHDRAWN' },
      });
      const next = await s.post('/queues/register/call-next', s.cookies.otherCashier);
      expect(orderSchema.parse(next.json()).id).toBe(first.id);
    });

    it('at the register: payment and code refused while pending, the order set aside', async () => {
      const order = await s.atRegister();
      const pending = await s.asked(order, [[s.products.soap, 'pct', '12']], s.cookies.cashier);
      expect(pending).toMatchObject({ status: 'AT_REGISTER', version: order.version + 1 });

      refused(await s.pay(pending, '119500'), 409, 'DISCOUNT_REQUEST_PENDING');
      refused(
        await s.post(`/orders/${order.id}/discount-code`, s.cookies.cashier, {
          code: 'ABCD-EFGH',
          version: pending.version,
        }),
        409,
        'DISCOUNT_REQUEST_PENDING',
      );
      refused(
        await s.post(`/orders/${order.id}/set-aside`, s.cookies.otherCashier),
        409,
        'ORDER_NOT_AT_REGISTER',
      );

      s.published.length = 0;
      const aside = await s.post(`/orders/${order.id}/set-aside`, s.cookies.cashier);
      expect(aside.statusCode, aside.body).toBe(200);
      expect(orderSchema.parse(aside.json())).toMatchObject({
        status: 'SUBMITTED',
        version: pending.version + 1,
      });
      expect(s.published).toContainEqual({
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId: order.id, change: 'released' },
      });
      const row = await t.db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row).toMatchObject({ cashierUserId: null, registerStationId: null });
      expect(await auditActions(t.db, order.id)).toContain('order.set_aside');
      // Nothing pending any more: nothing to set aside.
      const requestId = pending.discountRequest?.id ?? '';
      await s.post(`/discount-requests/${requestId}/reject`, s.cookies.owner);
      const called = await s.post('/queues/register/call-next', s.cookies.cashier);
      expect(orderSchema.parse(called.json()).id).toBe(order.id);
      refused(
        await s.post(`/orders/${order.id}/set-aside`, s.cookies.cashier),
        409,
        'DISCOUNT_REQUEST_NOT_PENDING',
      );
    });

    it('withdrawn by who asked, the cashier holding the order or the manager — nobody else', async () => {
      const quote = await s.quote();
      const pending = await s.asked(quote, [[null, 'pct', '10']]);
      const requestId = pending.discountRequest?.id ?? '';
      const withdraw = (cookie: string) =>
        s.post(`/discount-requests/${requestId}/withdraw`, cookie);

      refused(await withdraw(s.cookies.otherSales), 403, 'AUTH_FORBIDDEN');
      refused(await withdraw(s.cookies.cashier), 403, 'AUTH_FORBIDDEN');
      expect((await withdraw(s.cookies.owner)).statusCode).toBe(403);
      const reply = await withdraw(s.cookies.manager);
      expect(reply.statusCode, reply.body).toBe(200);
      const order = orderSchema.parse(reply.json());
      // The version stays: what the salesperson holds is still saved as is.
      expect(order).toMatchObject({ version: pending.version });
      expect(order.discountRequest?.closedAt).not.toBeNull();
      refused(await withdraw(s.cookies.sales), 409, 'DISCOUNT_REQUEST_NOT_PENDING');
      const stored = await t.db.discountRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(stored).toMatchObject({ status: 'WITHDRAWN', withdrawnById: s.ids.manager });
      expect(await auditActions(t.db, requestId)).toEqual([
        'discount_request.created',
        'discount_request.withdrawn',
      ]);
      // Asked again afterwards.
      expect((await s.ask(order, [[null, 'pct', '5']])).statusCode).toBe(201);
    });

    it('rejected by the owner alone: the order is then paid within the caps', async () => {
      const order = await s.atRegister();
      const pending = await s.asked(order, [[null, 'pct', '10']], s.cookies.cashier);
      const requestId = pending.discountRequest?.id ?? '';
      const reject = (cookie = s.cookies.owner) =>
        s.post(`/discount-requests/${requestId}/reject`, cookie);

      expect((await reject(s.cookies.manager)).statusCode).toBe(403);
      expect((await reject(s.cookies.cashier)).statusCode).toBe(403);
      s.published.length = 0;
      const rejected = s.decided(await reject());

      expect(rejected).toMatchObject({
        status: 'REJECTED',
        decidedBy: { fullName: expect.any(String) },
        code: null,
        order: { id: order.id, version: pending.version, total: '119500.00' },
      });
      expect(rejected.order.discountRequest?.status).toBe('REJECTED');
      expect(s.published).toContainEqual({
        rooms: ['role:owner', 'role:manager', `user:${s.ids.vola}`, 'queue:register'],
        event: 'discount.request_decided',
        payload: { requestId, orderId: order.id, status: 'REJECTED' },
      });
      refused(await reject(), 409, 'DISCOUNT_REQUEST_NOT_PENDING');
      refused(
        await s.grant(requestId, [[rejected.items[0]?.id ?? '', [null, 'pct', '10']]]),
        409,
        'DISCOUNT_REQUEST_NOT_PENDING',
      );
      refused(
        await s.post(`/discount-requests/${randomUUID()}/reject`, s.cookies.owner),
        404,
        'NOT_FOUND',
      );
      const paid = await s.pay(rejected.order, '119500');
      expect(paid.statusCode, paid.body).toBe(200);
    });

    it('goes with its order when cancelled', async () => {
      const order = await s.submitted();
      const pending = await s.asked(order, [[null, 'pct', '10']]);
      const requestId = pending.discountRequest?.id ?? '';
      s.published.length = 0;

      const cancelled = await s.post(`/orders/${order.id}/cancel`, s.cookies.sales, {
        version: pending.version,
        reason: 'Le client renonce',
      });

      expect(cancelled.statusCode, cancelled.body).toBe(200);
      expect(orderSchema.parse(cancelled.json()).discountRequest?.status).toBe('WITHDRAWN');
      const audit = await t.db.auditLog.findFirstOrThrow({
        where: { entityId: requestId, action: 'discount_request.withdrawn' },
      });
      expect(audit).toMatchObject({ userId: s.ids.vola, reason: 'order_cancelled' });
      expect(s.published).toContainEqual({
        rooms: ['role:owner', 'role:manager', `user:${s.ids.vola}`],
        event: 'discount.request_decided',
        payload: { requestId, orderId: order.id, status: 'WITHDRAWN' },
      });
    });

    it('expires at the day end; the owner lists those pending and those closed today', async () => {
      const kept = await s.asked(await s.quote(), [[null, 'pct', '10']]);
      const late = await s.asked(await s.submitted(), [[null, 'pct', '5']]);
      const lateId = late.discountRequest?.id ?? '';
      await t.db.discountRequest.update({
        where: { id: lateId },
        // Asked an hour ago, its day end just passed.
        data: {
          createdAt: new Date(Date.now() - 3_600_000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const list = async (cookie = s.cookies.owner) => {
        const reply = await get('/discount-requests', cookie);
        expect(reply.statusCode, reply.body).toBe(200);
        return discountRequestListSchema.parse(reply.json());
      };

      // Past its day end, it is no longer answered, even before the sweep.
      expect((await list()).pending.map((item) => item.id)).toEqual([kept.discountRequest?.id]);
      refused(
        await s.post(`/discount-requests/${lateId}/reject`, s.cookies.owner),
        409,
        'DISCOUNT_REQUEST_NOT_PENDING',
      );
      s.published.length = 0;
      await t.app.expiry.sweep();

      expect(s.published).toContainEqual({
        rooms: ['role:owner', 'role:manager', `user:${s.ids.vola}`, 'queue:register'],
        event: 'discount.request_decided',
        payload: { requestId: lateId, orderId: late.id, status: 'EXPIRED' },
      });
      const audit = await t.db.auditLog.findFirstOrThrow({
        where: { entityId: lateId, action: 'discount_request.expired' },
      });
      expect(audit.userId).toBeNull();
      const { pending, recent } = await list(s.cookies.manager);
      expect(pending.map((item) => item.id)).toEqual([kept.discountRequest?.id]);
      expect(recent).toMatchObject([{ id: lateId, status: 'EXPIRED', order: { id: late.id } }]);
      expect((await get('/discount-requests', s.cookies.sales)).statusCode).toBe(403);
      // Expired: the order in the queue is paid within the caps.
      const queue = queueSchema.parse((await get('/queues/register', s.cookies.cashier)).json());
      expect(queue.waiting[0]).toMatchObject({ orderId: late.id, discountPending: false });
    });
  },
);
