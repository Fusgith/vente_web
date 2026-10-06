import { discountCodeSchema, quoteSchema, type Quote } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

const PASSWORD = 'Boss-1234!';

describe.skipIf(!TEST_DATABASE_URL)(
  'an owner’s code attached to a quote (RG-REM-04/05, H42)',
  () => {
    let t: TestApp;
    let owner = '';
    let sales = '';
    let customer = '';
    let other = '';
    const units = { soapPack: '', nails: '' };
    const products = { soap: '', rice: '' };

    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      await t.reset();
      await seedDemoCatalog(t.db);
      await createUser(t.db, { username: 'boss', roles: ['owner'], password: PASSWORD });
      await createUser(t.db, {
        username: 'vola',
        roles: ['sales'],
        password: '1234',
        ticketLetter: 'A',
      });
      owner = (await loginOk(t.app, { username: 'boss', role: 'owner', password: PASSWORD }))
        .cookie;
      sales = (await loginOk(t.app, { username: 'vola', role: 'sales', password: '1234' })).cookie;
      customer = (
        await t.db.customer.create({ data: { name: 'Rasoa Hanta', phone: '034 11 222 33' } })
      ).id;
      other = (await t.db.customer.create({ data: { name: 'Be Noro', phone: '033 44 555 66' } }))
        .id;
      units.soapPack = await unitId(t.db, 'SAV-001', 'paquet');
      units.nails = await unitId(t.db, 'CLO-001', 'kg');
      products.soap = await productId(t.db, 'SAV-001');
      products.rice = await productId(t.db, 'RIZ-001');
    });

    /** 2 packs of soap at 5 % (its whole cap) and 3 kg of nails, 2 000 off the total. */
    const draft = (customerId = customer) => ({
      customerId,
      lines: [
        { productUnitId: units.soapPack, qty: '2', discount: { kind: 'pct', value: '5' } },
        { productUnitId: units.nails, qty: '3', discount: null },
      ],
      orderDiscount: { kind: 'amount', value: '2000' },
    });
    async function quoted(customerId = customer): Promise<Quote> {
      const reply = await request(t.app, 'POST', '/api/v1/quotes', {
        cookie: sales,
        body: draft(customerId),
      });
      expect(reply.statusCode, reply.body).toBe(201);
      return quoteSchema.parse(reply.json());
    }
    /** 12 % on the soap and 5 000 off the total, for Rasoa unless said otherwise. */
    async function issued(items?: unknown[], customerId = customer) {
      const reply = await request(t.app, 'POST', '/api/v1/discount-codes', {
        cookie: owner,
        body: {
          customerId,
          items: items ?? [
            { productId: products.soap, discount: { kind: 'pct', value: '12' } },
            { productId: null, discount: { kind: 'amount', value: '5000' } },
          ],
        },
      });
      expect(reply.statusCode, reply.body).toBe(201);
      return discountCodeSchema.parse(reply.json());
    }
    const attach = (id: string, code: string, version: number) =>
      request(t.app, 'POST', `/api/v1/quotes/${id}/discount-code`, {
        cookie: sales,
        body: { code, version },
      });

    it('applies the grants beyond the caps, uses the code, and keeps it on the quote', async () => {
      const quote = await quoted();
      const code = await issued();

      // Typed as heard: lower case, no dash.
      const reply = await attach(quote.id, code.code.replace('-', '').toLowerCase(), 1);

      expect(reply.statusCode, reply.body).toBe(200);
      const attached = quoteSchema.parse(reply.json());
      expect(attached).toMatchObject({
        version: 2,
        subtotal: '63500.00',
        orderDiscount: '5000.00',
        total: '58500.00',
        discountCode: {
          code: code.code,
          items: expect.arrayContaining([
            { productId: products.soap, discount: { kind: 'pct', value: '12.00' } },
            { productId: null, discount: { kind: 'amount', value: '5000.00' } },
          ]) as unknown,
        },
      });
      expect(attached.lines[0]).toMatchObject({ discountPct: '12.00', discountAmount: '6000.00' });
      expect(attached.lines[1]).toMatchObject({ discountAmount: '0.00', net: '19500.00' });
      const stored = await t.db.discountCode.findUniqueOrThrow({ where: { id: code.id } });
      expect(stored).toMatchObject({ status: 'USED', usedOnOrderId: quote.id });
      expect(await auditActions(t.db, code.id)).toEqual([
        'discount_code.issued',
        'discount_code.used',
      ]);
      expect(await auditActions(t.db, quote.id)).toEqual(['quote.created', 'quote.updated']);

      // Saved again, the grant still bounds the soap: 12 % passes, 13 % does not.
      const resave = (pct: string) =>
        request(t.app, 'PUT', `/api/v1/quotes/${quote.id}`, {
          cookie: sales,
          body: {
            ...draft(),
            lines: [
              { ...draft().lines[0], discount: { kind: 'pct', value: pct } },
              draft().lines[1],
            ],
            orderDiscount: { kind: 'amount', value: '5000' },
            version: 2,
          },
        });
      expect((await resave('13')).statusCode).toBe(422);
      const kept = await resave('12');
      expect(kept.statusCode, kept.body).toBe(200);
      expect(quoteSchema.parse(kept.json())).toMatchObject({ total: '58500.00' });

      // Validated for the register: the grants still hold against the caps (RG-CMD-04).
      const submitted = await request(t.app, 'POST', `/api/v1/orders/${quote.id}/submit`, {
        cookie: sales,
        body: { version: 3 },
      });
      expect(submitted.statusCode, submitted.body).toBe(200);
      expect(submitted.json()).toMatchObject({ total: '58500.00' });
    });

    it('refuses an unknown code, another customer’s, a used one, one covering nothing', async () => {
      const quote = await quoted();
      const refused = async (code: string, status: number, reason: string) => {
        const reply = await attach(quote.id, code, 1);
        expect(reply.statusCode, reply.body).toBe(status);
        expect(reply.json()).toMatchObject({ code: reason });
      };

      await refused('ZZZZ-ZZZZ', 422, 'DISCOUNT_CODE_UNKNOWN');
      await refused((await issued(undefined, other)).code, 409, 'DISCOUNT_CODE_OTHER_CUSTOMER');
      const rice = [{ productId: products.rice, discount: { kind: 'pct', value: '10' } }];
      await refused((await issued(rice)).code, 422, 'DISCOUNT_CODE_NOTHING_COVERED');

      // Single use: a code taken by a first quote no longer goes on a second one.
      const code = await issued();
      const second = await quoted();
      expect((await attach(second.id, code.code, 1)).statusCode).toBe(200);
      await refused(code.code, 409, 'DISCOUNT_CODE_NOT_ACTIVE');

      // One code per quote.
      const again = await attach(second.id, (await issued()).code, 2);
      expect(again.json()).toMatchObject({ code: 'QUOTE_HAS_CODE' });
      expect(await t.db.discountCode.count({ where: { status: 'USED' } })).toBe(1);
    });

    it('brings a total discount the grants leave no room for down to the headroom left', async () => {
      // No discount on the soap: its 2 500 of headroom, with the nails' 2 925, carry 5 000 off.
      const created = await request(t.app, 'POST', '/api/v1/quotes', {
        cookie: sales,
        body: {
          ...draft(),
          lines: [{ ...draft().lines[0], discount: null }, draft().lines[1]],
          orderDiscount: { kind: 'amount', value: '5000' },
        },
      });
      expect(created.statusCode, created.body).toBe(201);
      const quote = quoteSchema.parse(created.json());
      const code = await issued([
        { productId: products.soap, discount: { kind: 'pct', value: '12' } },
      ]);

      const reply = await attach(quote.id, code.code, 1);

      // 12 % on the soap uses its headroom: only the nails' 2 925 is left for the total.
      expect(reply.statusCode, reply.body).toBe(200);
      expect(quoteSchema.parse(reply.json())).toMatchObject({
        subtotal: '63500.00',
        orderDiscount: '2925.00',
        orderDiscountPct: null,
        total: '60575.00',
      });
    });

    it('refuses a price changed since the save, the code staying unused', async () => {
      const quote = await quoted();
      const code = await issued();
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

      const reply = await attach(quote.id, code.code, 1);

      expect(reply.statusCode, reply.body).toBe(409);
      expect(reply.json()).toMatchObject({ code: 'ORDER_PRICE_CHANGED', details: { lines: [2] } });
      const stored = await t.db.discountCode.findUniqueOrThrow({ where: { id: code.id } });
      expect(stored.status).toBe('ACTIVE');
    });

    it('never makes an order free: such a code refused, a quote at 0,00 never validated (H50)', async () => {
      const quote = await quoted();
      // The whole total given away: refused, the code left active for another try.
      const all = await issued([{ productId: null, discount: { kind: 'pct', value: '100' } }]);
      const free = await attach(quote.id, all.code, 1);
      expect(free.statusCode, free.body).toBe(422);
      expect(free.json()).toMatchObject({ code: 'DISCOUNT_CODE_FREE_ORDER' });
      const unused = await t.db.discountCode.findUniqueOrThrow({ where: { id: all.id } });
      expect(unused).toMatchObject({ status: 'ACTIVE', usedOnOrderId: null });
      expect((await t.db.order.findUniqueOrThrow({ where: { id: quote.id } })).version).toBe(1);

      // The soap given away, the nails paid: the code goes on.
      const soap = await issued([
        { productId: products.soap, discount: { kind: 'pct', value: '100' } },
      ]);
      expect((await attach(quote.id, soap.code, 1)).statusCode).toBe(200);
      // The nails removed, the draft saves at 0,00 — but never becomes an order.
      const saved = await request(t.app, 'PUT', `/api/v1/quotes/${quote.id}`, {
        cookie: sales,
        body: {
          ...draft(),
          lines: [{ ...draft().lines[0], discount: { kind: 'pct', value: '100' } }],
          orderDiscount: null,
          version: 2,
        },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(quoteSchema.parse(saved.json())).toMatchObject({ total: '0.00' });
      const submitted = await request(t.app, 'POST', `/api/v1/orders/${quote.id}/submit`, {
        cookie: sales,
        body: { version: 3 },
      });
      expect(submitted.statusCode, submitted.body).toBe(422);
      expect(submitted.json()).toMatchObject({ code: 'ORDER_TOTAL_ZERO' });
      const stored = await t.db.order.findUniqueOrThrow({ where: { id: quote.id } });
      expect([stored.status, stored.ticketSeq, stored.version]).toEqual(['DRAFT', null, 3]);
      expect(await t.db.reservation.count()).toBe(0);
    });
  },
);
