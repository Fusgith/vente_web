import { orderSchema, type Order } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import { auditActions, createTestApp, type TestApp } from './helpers.js';

type Entry = { kind: 'pct' | 'amount'; value: string } | null;

describe.skipIf(!TEST_DATABASE_URL)('discounts applied at the register (H61)', () => {
  let t: TestApp;
  let s: DiscountScene;
  let order: Order;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    s = await discountScene(t);
    order = await s.atRegister();
    s.published.length = 0;
  });

  /** Soap at position 1 (100 000, cap 5 %), nails at position 2 (19 500, cap 15 %). */
  const discount = (
    lines: [number, Entry][],
    orderDiscount?: Entry,
    cookie = s.cookies.cashier,
    version = order.version,
  ) =>
    s.post(`/orders/${order.id}/discounts`, cookie, {
      version,
      lines: lines.map(([position, entry]) => ({ position, discount: entry })),
      ...(orderDiscount === undefined ? {} : { orderDiscount }),
    });
  const applied = async (reply: Awaited<ReturnType<typeof discount>>) => {
    expect(reply.statusCode, reply.body).toBe(200);
    return orderSchema.parse(reply.json());
  };

  it('within the caps, on the lines and the total: same number, audited, the registers told', async () => {
    const after = await applied(
      await discount(
        [
          [1, { kind: 'pct', value: '5' }],
          [2, { kind: 'amount', value: '2000' }],
        ],
        { kind: 'amount', value: '900' },
      ),
    );
    expect(after).toMatchObject({
      number: order.number,
      status: 'AT_REGISTER',
      version: order.version + 1,
      subtotal: '112500.00',
      orderDiscount: '900.00',
      discountTotal: '7900.00',
      total: '111600.00',
    });
    expect(after.lines).toMatchObject([
      { discountPct: '5.00', discountAmount: '5000.00', discountSource: 'WITHIN_CAP' },
      { discountAmount: '2000.00', discountSource: 'WITHIN_CAP', net: '17500.00' },
    ]);
    expect(await auditActions(t.db, order.id)).toContain('order.discounted');
    const audit = await t.db.auditLog.findFirstOrThrow({
      where: { entityId: order.id, action: 'order.discounted' },
    });
    expect(audit.before).toMatchObject({ total: '119500.00' });
    expect(audit.after).toMatchObject({ total: '111600.00' });
    expect(s.published).toEqual([
      {
        rooms: ['queue:register'],
        event: 'queue.changed',
        payload: { queue: 'register', orderId: order.id, change: 'updated' },
      },
    ]);
    // The reservation stays as it was: quantities never change here.
    expect(await t.db.reservation.count({ where: { orderId: order.id } })).toBe(2);
  });

  it('refuses a discount beyond its cap, saying which; the owner decides beyond', async () => {
    const line = await discount([[1, { kind: 'pct', value: '6' }]]);
    expect(line.statusCode).toBe(422);
    expect(line.json()).toMatchObject({
      code: 'QUOTE_DISCOUNT_BEYOND_CAP',
      details: { lines: [1], order: false },
    });
    // Soap at its cap leaves only the nails' 2 925 MGA for the total.
    const total = await discount([[1, { kind: 'pct', value: '5' }]], {
      kind: 'amount',
      value: '3000',
    });
    expect(total.statusCode).toBe(422);
    expect(total.json()).toMatchObject({ details: { lines: [], order: true } });
    expect(await t.db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      version: order.version,
    });
  });

  it('a total left as it was comes down to the headroom the lines leave; null removes', async () => {
    const first = await applied(await discount([], { kind: 'amount', value: '2000' }));
    expect(first).toMatchObject({ orderDiscount: '2000.00', total: '117500.00' });
    order = first;
    // The soap at its cap and the nails at 2 000: 925 MGA left for the total.
    const second = await applied(
      await discount([
        [1, { kind: 'pct', value: '5' }],
        [2, { kind: 'amount', value: '2000' }],
      ]),
    );
    expect(second).toMatchObject({ orderDiscount: '925.00', total: '111575.00' });
    order = second;
    const third = await applied(await discount([[1, null]], null));
    expect(third.lines[0]).toMatchObject({ discountAmount: '0.00', discountSource: 'NONE' });
    expect(third).toMatchObject({ orderDiscount: '0.00', total: '117500.00' });
  });

  it('by the cashier who called the order or the manager, on the version read', async () => {
    const five: [number, Entry][] = [[1, { kind: 'pct', value: '5' }]];
    expect((await discount(five, undefined, s.cookies.sales)).statusCode).toBe(403);
    const other = await discount(five, undefined, s.cookies.otherCashier);
    expect(other.json()).toMatchObject({ code: 'ORDER_NOT_AT_REGISTER' });
    const stale = await discount(five, undefined, s.cookies.cashier, order.version + 1);
    expect(stale.json()).toMatchObject({ code: 'ORDER_CHANGED' });
    const unknown = await discount([[3, { kind: 'pct', value: '5' }]]);
    expect(unknown.json()).toMatchObject({ code: 'ORDER_CHANGED' });
    await applied(await discount(five, undefined, s.cookies.manager));
  });

  it('waits for the owner while a request is pending', async () => {
    order = await s.asked(order, [[s.products.soap, 'pct', '12']], s.cookies.cashier);
    const reply = await discount([[2, { kind: 'pct', value: '10' }]]);
    expect(reply.statusCode).toBe(409);
    expect(reply.json()).toMatchObject({ code: 'DISCOUNT_REQUEST_PENDING' });
  });
});
