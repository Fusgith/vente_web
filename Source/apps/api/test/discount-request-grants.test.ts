import { randomUUID } from 'node:crypto';

import {
  discountCodeListSchema,
  orderSchema,
  paidOrderSchema,
  quoteSchema,
} from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import { auditActions, createTestApp, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)(
  'the owner grants a discount request item by item (RG-REM-03, H53)',
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

    it('on a quote: a code issued and used at once, the quote at its new discounts', async () => {
      const quote = await s.quote({ kind: 'pct', value: '5' });
      expect(quote).toMatchObject({ subtotal: '114500.00', total: '114500.00' });
      const pending = await s.asked(quote, [
        [s.products.soap, 'pct', '20'],
        [s.products.nails, 'amount', '3000'],
        [null, 'amount', '5000'],
      ]);
      const [nails, soap, total] = pending.discountRequest?.items ?? [];
      const requestId = pending.discountRequest?.id ?? '';
      s.published.length = 0;

      // Less on the soap, nothing on the nails, the total as asked.
      const granted = s.decided(
        await s.grant(requestId, [
          [nails?.id ?? '', null],
          [soap?.id ?? '', [s.products.soap, 'pct', '15']],
          [total?.id ?? '', [null, 'amount', '5000']],
        ]),
      );

      expect(granted).toMatchObject({
        status: 'GRANTED',
        decidedBy: { fullName: expect.any(String) },
        code: expect.any(String),
        items: [
          { product: { sku: 'CLO-001' }, granted: null },
          { product: { sku: 'SAV-001' }, granted: { kind: 'pct', value: '15.00' } },
          { product: null, granted: { kind: 'amount', value: '5000.00' } },
        ],
      });
      expect(granted.order).toMatchObject({
        status: 'DRAFT',
        version: pending.version + 1,
        subtotal: '104500.00',
        orderDiscount: '5000.00',
        total: '99500.00',
        // H64: the order says the owner granted it; the code stays in the base, never shown.
        discountCode: { code: granted.code, granted: true },
        discountRequest: { status: 'GRANTED' },
      });
      expect(granted.order.lines).toMatchObject([
        { discountPct: '15.00', discountAmount: '15000.00', discountSource: 'CODE' },
        { discountAmount: '0.00', discountSource: 'NONE', net: '19500.00' },
      ]);
      const code = await t.db.discountCode.findFirstOrThrow({ where: { requestId } });
      expect(code).toMatchObject({
        status: 'USED',
        usedOnOrderId: quote.id,
        customerId: s.ids.customer,
        orderId: quote.id,
      });
      expect(await t.db.discountCodeItem.count({ where: { codeId: code.id } })).toBe(2);
      // Never shown, not even in the owner's list of codes (H64).
      const codes = await request(t.app, 'GET', '/api/v1/discount-codes', {
        cookie: s.cookies.owner,
      });
      expect(discountCodeListSchema.parse(codes.json()).items).toEqual([]);
      expect(await auditActions(t.db, code.id)).toEqual([
        'discount_code.issued',
        'discount_code.used',
      ]);
      expect(await auditActions(t.db, requestId)).toEqual([
        'discount_request.created',
        'discount_request.granted',
      ]);
      const audit = await t.db.auditLog.findFirstOrThrow({
        where: { entityId: quote.id, action: 'quote.updated' },
        orderBy: { id: 'desc' },
      });
      expect(audit.before).toMatchObject({ total: '114500.00' });
      expect(audit.after).toMatchObject({ total: '99500.00' });
      // Not in the queue yet: the registers are not told.
      expect(s.published).toEqual([
        {
          rooms: ['role:owner', 'role:manager', `user:${s.ids.vola}`],
          event: 'discount.request_decided',
          payload: { requestId, orderId: quote.id, status: 'GRANTED' },
        },
      ]);

      // Validated, the grants kept beyond the caps; no second request once a code is used.
      const submitted = await s.post(`/orders/${quote.id}/submit`, s.cookies.sales, {
        version: granted.order.version,
      });
      expect(submitted.statusCode, submitted.body).toBe(200);
      const order = orderSchema.parse(submitted.json());
      expect(order).toMatchObject({ status: 'SUBMITTED', total: '99500.00' });
      refused(await s.ask(order, [[null, 'pct', '5']]), 409, 'ORDER_HAS_CODE');
    });

    it('never validates a quote brought to 0,00 after the grant (H50)', async () => {
      const quote = await s.quote();
      const pending = await s.asked(quote, [[s.products.soap, 'pct', '100']]);
      const [soap] = pending.discountRequest?.items ?? [];
      // The soap given away, the nails paid: granted.
      const granted = s.decided(
        await s.grant(pending.discountRequest?.id ?? '', [
          [soap?.id ?? '', [s.products.soap, 'pct', '100']],
        ]),
      );
      // The nails removed, the draft saves at 0,00 — but never becomes an order.
      const saved = await request(t.app, 'PUT', `/api/v1/quotes/${quote.id}`, {
        cookie: s.cookies.sales,
        body: {
          version: granted.order.version,
          customerId: s.ids.customer,
          lines: [
            { productUnitId: s.units.soapPack, qty: '4', discount: { kind: 'pct', value: '100' } },
          ],
          orderDiscount: null,
        },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      const zero = quoteSchema.parse(saved.json());
      expect(zero).toMatchObject({ total: '0.00' });
      refused(
        await s.post(`/orders/${quote.id}/submit`, s.cookies.sales, { version: zero.version }),
        422,
        'ORDER_TOTAL_ZERO',
      );
      const stored = await t.db.order.findUniqueOrThrow({ where: { id: quote.id } });
      expect([stored.status, stored.ticketSeq, stored.version]).toEqual([
        'DRAFT',
        null,
        zero.version,
      ]);
      expect(await t.db.reservation.count()).toBe(0);
    });

    it('at the register: the order adjusted, the registers told, paid with the code named', async () => {
      const order = await s.atRegister();
      const pending = await s.asked(order, [[s.products.soap, 'pct', '12']], s.cookies.cashier);
      const [soap] = pending.discountRequest?.items ?? [];
      const requestId = pending.discountRequest?.id ?? '';
      s.published.length = 0;

      const granted = s.decided(
        await s.grant(requestId, [[soap?.id ?? '', [s.products.soap, 'pct', '12']]]),
      );

      expect(granted.order).toMatchObject({
        status: 'AT_REGISTER',
        version: order.version + 2,
        total: '107500.00',
      });
      expect(s.published).toEqual([
        {
          rooms: ['role:owner', 'role:manager', `user:${s.ids.vola}`, 'queue:register'],
          event: 'discount.request_decided',
          payload: { requestId, orderId: order.id, status: 'GRANTED' },
        },
        {
          rooms: ['queue:register'],
          event: 'queue.changed',
          payload: { queue: 'register', orderId: order.id, change: 'updated' },
        },
      ]);
      const audit = await t.db.auditLog.findFirstOrThrow({
        where: { entityId: order.id, action: 'order.adjusted' },
      });
      expect(audit.before).toMatchObject({ total: '119500.00' });
      expect(audit.after).toMatchObject({ total: '107500.00' });

      const paid = await s.pay(granted.order, '107500');
      expect(paid.statusCode, paid.body).toBe(200);
      const { invoice } = paidOrderSchema.parse(paid.json());
      const frozen = await t.db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(frozen.snapshot).toMatchObject({
        discountCode: granted.code,
        discountGranted: true,
        totals: { discountTotal: '12000.00', total: '107500.00' },
      });
    });

    it('refuses an answer covering nothing left or making the order free: still pending', async () => {
      const quote = await s.quote();
      const pending = await s.asked(quote, [
        [s.products.soap, 'pct', '20'],
        [null, 'pct', '10'],
      ]);
      const [soap, total] = pending.discountRequest?.items ?? [];
      const requestId = pending.discountRequest?.id ?? '';
      // The soap taken off the quote meanwhile.
      const saved = await request(t.app, 'PUT', `/api/v1/quotes/${quote.id}`, {
        cookie: s.cookies.sales,
        body: {
          version: pending.version,
          customerId: s.ids.customer,
          lines: [{ productUnitId: s.units.nails, qty: '3', discount: null }],
          orderDiscount: null,
        },
      });
      const left = quoteSchema.parse(saved.json());
      const soapOnly: [string, [string, 'pct', string] | null][] = [
        [soap?.id ?? '', [s.products.soap, 'pct', '20']],
        [total?.id ?? '', null],
      ];

      refused(await s.grant(requestId, soapOnly), 422, 'DISCOUNT_REQUEST_NOTHING_COVERED');
      refused(
        await s.grant(requestId, [
          [soap?.id ?? '', null],
          [total?.id ?? '', [null, 'pct', '100']],
        ]),
        422,
        'DISCOUNT_REQUEST_FREE_ORDER',
      );
      // Every item answered, once, and one of them at least granted.
      refused(
        await s.grant(requestId, [[total?.id ?? '', [null, 'pct', '10']]]),
        400,
        'BAD_REQUEST',
      );
      refused(
        await s.grant(requestId, [
          [soap?.id ?? '', null],
          [randomUUID(), [null, 'pct', '10']],
        ]),
        400,
        'BAD_REQUEST',
      );
      expect(
        (
          await s.grant(requestId, [
            [soap?.id ?? '', null],
            [total?.id ?? '', null],
          ])
        ).statusCode,
      ).toBe(400);
      const still = await t.db.discountRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(still).toMatchObject({ status: 'PENDING', decidedAt: null });
      expect(await t.db.discountCode.count()).toBe(0);
      expect((await t.db.order.findUniqueOrThrow({ where: { id: quote.id } })).version).toBe(
        left.version,
      );

      const granted = s.decided(
        await s.grant(requestId, [
          [soap?.id ?? '', null],
          [total?.id ?? '', [null, 'pct', '10']],
        ]),
      );
      expect(granted.order).toMatchObject({
        orderDiscountPct: '10.00',
        orderDiscount: '1950.00',
        total: '17550.00',
      });
    });

    it('the owner alone decides, once', async () => {
      const pending = await s.asked(await s.quote(), [[null, 'pct', '10']]);
      const [total] = pending.discountRequest?.items ?? [];
      const requestId = pending.discountRequest?.id ?? '';
      const answer: [string, [null, 'pct', string]][] = [[total?.id ?? '', [null, 'pct', '10']]];

      expect((await s.grant(requestId, answer, s.cookies.manager)).statusCode).toBe(403);
      expect((await s.grant(requestId, answer, s.cookies.sales)).statusCode).toBe(403);
      refused(await s.grant(randomUUID(), answer), 404, 'NOT_FOUND');
      expect(
        (await s.post(`/discount-requests/${requestId}/withdraw`, s.cookies.sales)).statusCode,
      ).toBe(200);
      refused(await s.grant(requestId, answer), 409, 'DISCOUNT_REQUEST_NOT_PENDING');
      expect(await t.db.discountCode.count()).toBe(0);
    });
  },
);
