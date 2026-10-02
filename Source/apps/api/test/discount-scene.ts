import { randomUUID } from 'node:crypto';

import {
  discountRequestSchema,
  orderSchema,
  quoteSchema,
  type Order,
  type Quote,
} from '@vente-web/shared';
import { expect, vi } from 'vitest';

import type { Emission } from '../src/services/realtime-rooms.js';
import { productId, seedDemoCatalog, seedPaymentMethods, unitId } from './catalog.js';
import { createStation, createUser, loginOk, request, type TestApp } from './helpers.js';

const PASSWORD = 'Boss-1234!';

/** What a discount request asks: a product (null: the total), a rate or an amount. */
export type Asked = [string | null, 'pct' | 'amount', string];

const entry = ([productId, kind, value]: Asked) => ({ productId, discount: { kind, value } });

/**
 * The people of a discount request (T-033): Vola sells, Hery too, Soa and Rina cash, the manager
 * follows, the owner decides. 4 packs of soap (100 000, cap 5 %), 3 kg of nails (19 500, cap 15 %).
 */
export async function discountScene(t: TestApp) {
  await t.reset();
  const { managerId } = await seedDemoCatalog(t.db);
  const cash = (await seedPaymentMethods(t.db))['CASH'] ?? '';
  await createUser(t.db, { username: 'boss', roles: ['owner'], password: PASSWORD });
  const vola = await createUser(t.db, {
    username: 'vola',
    roles: ['sales'],
    pin: '1234',
    ticketLetter: 'A',
  });
  await createUser(t.db, { username: 'hery', roles: ['sales'], pin: '2345', ticketLetter: 'B' });
  await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '3456' });
  await createUser(t.db, { username: 'rina', roles: ['cashier'], pin: '5678' });
  const cookies = {
    owner: (await loginOk(t.app, { username: 'boss', role: 'owner', password: PASSWORD })).cookie,
    sales: '',
    otherSales: '',
    cashier: '',
    otherCashier: '',
    manager: '',
  };
  for (const [key, username, role, pin] of [
    ['sales', 'vola', 'sales', '1234'],
    ['otherSales', 'hery', 'sales', '2345'],
    ['cashier', 'soa', 'cashier', '3456'],
    ['otherCashier', 'rina', 'cashier', '5678'],
    ['manager', 'responsable', 'manager', '1234'],
  ] as const)
    cookies[key] = (await loginOk(t.app, { username, role, pin })).cookie;
  const customer = (
    await t.db.customer.create({ data: { name: 'Rasoa Hanta', phone: '034 11 222 33' } })
  ).id;
  const units = {
    soapPack: await unitId(t.db, 'SAV-001', 'paquet'),
    nails: await unitId(t.db, 'CLO-001', 'kg'),
  };
  const products = {
    soap: await productId(t.db, 'SAV-001'),
    nails: await productId(t.db, 'CLO-001'),
    rice: await productId(t.db, 'RIZ-001'),
  };
  const published: Emission[] = [];
  vi.spyOn(t.app.realtime, 'publish').mockImplementation((emissions) => {
    published.push(...emissions);
  });

  const post = (url: string, cookie: string, body?: unknown, key?: string) =>
    request(t.app, 'POST', `/api/v1${url}`, {
      cookie,
      ...(body ? { body } : {}),
      ...(key ? { headers: { 'idempotency-key': key } } : {}),
    });

  /** Vola's quote: soap and nails, the discounts within the caps given. */
  async function quote(soap: unknown = null, nails: unknown = null): Promise<Quote> {
    const reply = await post('/quotes', cookies.sales, {
      customerId: customer,
      lines: [
        { productUnitId: units.soapPack, qty: '4', discount: soap },
        { productUnitId: units.nails, qty: '3', discount: nails },
      ],
      orderDiscount: null,
    });
    expect(reply.statusCode, reply.body).toBe(201);
    return quoteSchema.parse(reply.json());
  }

  /** Validated by Vola: in the register queue. */
  async function submitted(soap: unknown = null): Promise<Order> {
    const { id } = await quote(soap);
    const reply = await post(`/orders/${id}/submit`, cookies.sales, { version: 1 });
    expect(reply.statusCode, reply.body).toBe(200);
    return orderSchema.parse(reply.json());
  }

  /** Called by Soa: at her register. */
  async function atRegister(): Promise<Order> {
    await submitted();
    const reply = await post('/queues/register/call-next', cookies.cashier);
    expect(reply.statusCode, reply.body).toBe(200);
    return orderSchema.parse(reply.json());
  }

  const ask = (
    order: { id: string; version: number },
    items: Asked[],
    cookie = cookies.sales,
    extra: { reason?: string; note?: string | null; version?: number } = {},
  ) =>
    post('/discount-requests', cookie, {
      orderId: order.id,
      version: extra.version ?? order.version,
      items: items.map(entry),
      reason: extra.reason ?? 'Client fidèle',
      note: extra.note ?? null,
    });

  /** Asked and accepted: the order with its pending request. */
  async function asked(
    order: { id: string; version: number },
    items: Asked[],
    cookie = cookies.sales,
  ): Promise<Order> {
    const reply = await ask(order, items, cookie);
    expect(reply.statusCode, reply.body).toBe(201);
    return orderSchema.parse(reply.json());
  }

  /** The owner's answer, item by item in the request's order: null for not granted. */
  const grant = (requestId: string, answers: [string, Asked | null][], cookie = cookies.owner) =>
    post(`/discount-requests/${requestId}/grant`, cookie, {
      items: answers.map(([itemId, answer]) => ({
        itemId,
        discount: answer ? entry(answer).discount : null,
      })),
    });

  const decided = (reply: { statusCode: number; body: string; json: () => unknown }) => {
    expect(reply.statusCode, reply.body).toBe(200);
    return discountRequestSchema.parse(reply.json());
  };

  /** Paid in cash at Soa's register, opened for it. */
  async function pay(order: Order, amount: string) {
    const stationId = (await createStation(t.db, 'REGISTER')).id;
    await post('/register-sessions', cookies.cashier, { stationId, openingFloat: '0' });
    return post(
      `/orders/${order.id}/pay`,
      cookies.cashier,
      {
        version: order.version,
        lines: [{ methodId: cash, amount, reference: null }],
        cashReceived: amount,
      },
      randomUUID(),
    );
  }

  return {
    ids: { vola: vola.id, manager: managerId, customer },
    cookies,
    units,
    products,
    published,
    post,
    quote,
    submitted,
    atRegister,
    ask,
    asked,
    grant,
    decided,
    pay,
  };
}

export type DiscountScene = Awaited<ReturnType<typeof discountScene>>;
