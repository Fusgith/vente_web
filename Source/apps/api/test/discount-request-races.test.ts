import { orderSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { listDiscountRequests } from '../src/services/discount-requests.js';
import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import { createTestApp, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)(
  'exceptional discount requests at their edges: races, day ends (⚠️ H52, H54)',
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

    const refused = (
      reply: { statusCode: number; body: string; json: () => unknown },
      status: number,
      reason: string,
    ) => {
      expect(reply.statusCode, reply.body).toBe(status);
      expect(reply.json()).toMatchObject({ code: reason });
    };

    /** A request on the order, as the service makes it: the total, 5 %, its day end to come. */
    const requestData = (orderId: string) => ({
      orderId,
      customerId: s.ids.customer,
      reason: 'Client fidèle',
      requestedById: s.ids.vola,
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    it('never calls an order asked about while the call waited on it', async () => {
      const first = await s.submitted();
      const second = await s.submitted();
      let locked: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        locked = resolve;
      });

      // Vola asks on the first order while Soa calls the next one: the call waits on its lock.
      const asking = t.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${first.id}::uuid FOR UPDATE`;
        locked();
        await tx.discountRequest.create({
          data: {
            ...requestData(first.id),
            items: { create: [{ productId: null, requestedPct: '5' }] },
          },
        });
        await tx.order.update({ where: { id: first.id }, data: { version: { increment: 1 } } });
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      await held;
      const calling = s.post('/queues/register/call-next', s.cookies.cashier);
      await asking;
      const called = await calling;

      expect(called.statusCode, called.body).toBe(200);
      expect(orderSchema.parse(called.json()).id).toBe(second.id);
      const waiting = await t.db.order.findUniqueOrThrow({ where: { id: first.id } });
      expect(waiting).toMatchObject({ status: 'SUBMITTED', cashierUserId: null });
    });

    it('closes the request of an order expired at its day end, the owner told', async () => {
      const order = await s.asked(await s.submitted(), [[null, 'pct', '5']]);
      const requestId = order.discountRequest?.id ?? '';
      // The order's day end passed; the request, set aside after it, ends later.
      await t.db.order.update({
        where: { id: order.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      s.published.length = 0;

      expect(await t.app.expiry.sweep()).toEqual([
        { id: order.id, salesUserId: s.ids.vola, requestId },
      ]);

      const request = await t.db.discountRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(request.status).toBe('EXPIRED');
      expect(request.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
      const audit = await t.db.auditLog.findFirstOrThrow({
        where: { entityId: requestId, action: 'discount_request.expired' },
      });
      expect(audit).toMatchObject({ userId: null, reason: 'order_expired' });
      expect(s.published.filter((e) => e.event === 'discount.request_decided')).toEqual([
        {
          rooms: ['role:owner', 'role:manager', `user:${s.ids.vola}`],
          event: 'discount.request_decided',
          payload: { requestId, orderId: order.id, status: 'EXPIRED' },
        },
      ]);
      const { pending, recent } = await listDiscountRequests(t.db);
      expect(pending).toEqual([]);
      expect(recent).toMatchObject([{ id: requestId, status: 'EXPIRED' }]);
    });

    it('lists the latest closed first, whenever asked, 100 at most', async () => {
      const { id } = await s.quote();
      const now = Date.now();
      const closed = (createdAt: number, decidedAt: number) => ({
        ...requestData(id),
        status: 'REJECTED' as const,
        decidedById: s.ids.manager,
        createdAt: new Date(createdAt),
        decidedAt: new Date(decidedAt),
      });
      await t.db.discountRequest.createMany({
        data: Array.from({ length: 101 }, (_, i) => closed(now - 5000 + i, now - 4000 + i)),
      });
      // Asked before all of them, refused after all of them.
      const early = await t.db.discountRequest.create({ data: closed(now - 10_000, now - 1000) });

      const { recent } = await listDiscountRequests(t.db);

      expect(recent).toHaveLength(100);
      expect(recent[0]?.id).toBe(early.id);
    });

    it('past its day end, before the sweep, a request holds the order no more', async () => {
      const order = await s.atRegister();
      const pending = await s.asked(order, [[s.products.soap, 'pct', '12']], s.cookies.cashier);
      const requestId = pending.discountRequest?.id ?? '';
      await t.db.discountRequest.update({
        where: { id: requestId },
        data: {
          createdAt: new Date(Date.now() - 3_600_000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      refused(
        await s.post(`/discount-requests/${requestId}/withdraw`, s.cookies.cashier),
        409,
        'DISCOUNT_REQUEST_NOT_PENDING',
      );
      refused(
        await s.post(`/orders/${order.id}/set-aside`, s.cookies.cashier),
        409,
        'DISCOUNT_REQUEST_NOT_PENDING',
      );
      // Paid within the caps: the owner can no longer answer.
      const paid = await s.pay(pending, '119500');
      expect(paid.statusCode, paid.body).toBe(200);
    });
  },
);
