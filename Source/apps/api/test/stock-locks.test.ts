import { customerSchema, quoteSchema } from '@vente-web/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { productId, seedDemoCatalog, unitId } from './catalog.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, createUser, loginOk, request, type TestApp } from './helpers.js';

describe.skipIf(!TEST_DATABASE_URL)('stock rows locked in one order (RG-STK-01)', () => {
  let t: TestApp;
  let cookie = '';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await seedDemoCatalog(t.db);
    await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234', ticketLetter: 'A' });
    cookie = (await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' })).cookie;
  });

  const post = (url: string, body: unknown) =>
    request(t.app, 'POST', `/api/v1${url}`, { cookie, body });

  /** Resolves once a backend of the test database waits on a row lock. */
  async function someoneWaits(): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [row] = await t.db.$queryRaw<{ waiting: bigint }[]>`
        SELECT count(*) AS "waiting" FROM pg_stat_activity
        WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`;
      if (row && row.waiting > 0n) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('nobody waits on a lock');
  }

  it('frees the stock of a cancelled order in product order, as a validation takes it', async () => {
    const soap = {
      id: await productId(t.db, 'SAV-001'),
      unit: await unitId(t.db, 'SAV-001', 'pièce'),
    };
    const nails = {
      id: await productId(t.db, 'CLO-001'),
      unit: await unitId(t.db, 'CLO-001', 'kg'),
    };
    const [first, last] = soap.id < nails.id ? [soap, nails] : [nails, soap];
    const customer = await post('/customers', { name: 'Rasoa Hanta', phone: '034 11 222 33' });
    // The lines in the reverse of the product order: so are the reservations stored.
    const quote = await post('/quotes', {
      customerId: customerSchema.parse(customer.json()).id,
      lines: [last, first].map(({ unit }) => ({ productUnitId: unit, qty: '1', discount: null })),
      orderDiscount: null,
    });
    const { id } = quoteSchema.parse(quote.json());
    expect((await post(`/orders/${id}/submit`, { version: 1 })).statusCode).toBe(200);

    // A validation holds the first product and is about to take the last one.
    let cancelled: Promise<number> | undefined;
    const lastTaken = await t.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "product_stock" WHERE "product_id" = ${first.id}::uuid FOR UPDATE`;
      cancelled = post(`/orders/${id}/cancel`, { version: 2, reason: 'Le client renonce' }).then(
        (response) => response.statusCode,
      );
      await someoneWaits();
      // The cancellation waits on the first product without holding the last: no deadlock.
      return tx.$queryRaw`SELECT 1 FROM "product_stock" WHERE "product_id" = ${last.id}::uuid FOR UPDATE NOWAIT`.then(
        () => 'free',
        () => 'held',
      );
    });
    expect(lastTaken).toBe('free');
    expect(await cancelled).toBe(200);
  });
});
