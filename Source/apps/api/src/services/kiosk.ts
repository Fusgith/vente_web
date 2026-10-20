import {
  KIOSK_IDLE_SECONDS,
  KIOSK_MAX_BASKETS_PER_HOUR,
  basketLabel,
  kioskBasketLineSchema,
  lineGross,
  sumAmounts,
  type KioskBasket,
  type KioskBasketInput,
  type KioskHome,
  type KioskProduct,
  type KioskSearchResult,
  type ProductHit,
  type ProductSearchQuery,
  type QuoteUnavailable,
} from '@vente-web/shared';
import { z } from 'zod';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { Actor } from './actor.js';
import { createCustomer } from './customers.js';
import { inForceAt } from './product-hits.js';
import { searchProducts, shopBestSellers } from './product-search.js';
import { createQuote } from './quotes.js';
import { nextSequenceValue } from './sequences.js';
import { readPositiveIntSetting } from './settings.js';
import { shopDateValue, shopIsoDate } from './shop-time.js';

const HOUR_MS = 3_600_000;
/** The kiosk never reads a discount cap (RG-BOR-01). */
const NO_CAPS = { showCaps: false };

/** The active kiosk this address key opens (RG-BOR-01), as the public display's (RG-DSP-03). */
export async function findKiosk(db: Db, key: string): Promise<{ id: string; name: string } | null> {
  return db.station.findFirst({
    where: { displayKey: key, type: 'KIOSK', isActive: true },
    select: { id: true, name: true },
  });
}

/** What the kiosk shows of a product: sellable units at base price, sold out or not (RG-BOR-01). */
function kioskProducts(hits: readonly ProductHit[]): KioskProduct[] {
  return hits.flatMap((hit) => {
    const units = hit.units.flatMap((unit) =>
      unit.price
        ? [{ id: unit.id, label: unit.label, factor: unit.factor, price: unit.price }]
        : [],
    );
    return units.length === 0
      ? []
      : [{ id: hit.id, name: hit.name, soldOut: Number(hit.available) <= 0, units }];
  });
}

export async function kioskHome(db: Db, station: { name: string }): Promise<KioskHome> {
  return {
    station: station.name,
    idleSeconds: await readPositiveIntSetting(db, 'kiosk.idle_seconds', KIOSK_IDLE_SECONDS),
    favorites: kioskProducts(await shopBestSellers(db, NO_CAPS)),
  };
}

export async function kioskSearch(db: Db, query: ProductSearchQuery): Promise<KioskSearchResult> {
  const result = await searchProducts(db, query, NO_CAPS);
  return { exact: result.exact, items: kioskProducts(result.items), more: result.more };
}

/**
 * A basket sent by the kiosk (RG-BOR-03/04): each line at the base price in force (H66), numbered
 * P1, P2… per shop day. At most `kiosk.max_baskets_per_hour` per kiosk (RG-BOR-06).
 */
export async function sendBasket(
  db: Db,
  stationId: string,
  input: KioskBasketInput,
): Promise<{ id: string; basket: string }> {
  const now = new Date();
  const max = await readPositiveIntSetting(
    db,
    'kiosk.max_baskets_per_hour',
    KIOSK_MAX_BASKETS_PER_HOUR,
  );
  const recent = await db.kioskBasket.count({
    where: { stationId, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
  });
  if (recent >= max) throw new AppError(429, 'KIOSK_BUSY');

  const units = await db.productUnit.findMany({
    where: {
      id: { in: input.lines.map((line) => line.productUnitId) },
      isActive: true,
      product: { isActive: true },
    },
    select: {
      id: true,
      prices: {
        where: { AND: [inForceAt(now), { customerType: null }] },
        orderBy: { effectiveFrom: 'desc' },
        take: 1,
        select: { price: true },
      },
    },
  });
  const prices = new Map(
    units.flatMap((unit) => unit.prices.map((entry) => [unit.id, entry.price.toFixed(2)] as const)),
  );
  const gross: string[] = [];
  const unavailable: number[] = [];
  input.lines.forEach((line, index) => {
    const price = prices.get(line.productUnitId);
    if (price) gross.push(lineGross(line.qty, price));
    else unavailable.push(index + 1);
  });
  if (unavailable.length > 0) {
    throw new AppError(422, 'QUOTE_LINE_UNAVAILABLE', {
      lines: unavailable,
    } satisfies QuoteUnavailable);
  }

  return db.$transaction(async (tx) => {
    const seq = await nextSequenceValue(tx, `BASKET-${shopIsoDate(now)}`);
    const { id } = await tx.kioskBasket.create({
      data: {
        stationId,
        day: shopDateValue(now),
        seq,
        name: input.name,
        phone: input.phone,
        lines: input.lines as Prisma.InputJsonValue,
        lineCount: input.lines.length,
        total: sumAmounts(gross),
      },
      select: { id: true },
    });
    return { id, basket: basketLabel(seq) };
  });
}

/** Today's baskets no salesperson took yet, the oldest first; the others expired (RG-BOR-06). */
export async function pendingBaskets(db: Db): Promise<KioskBasket[]> {
  const rows = await db.kioskBasket.findMany({
    where: { day: shopDateValue(new Date()), takenById: null },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    basket: basketLabel(row.seq),
    name: row.name,
    lineCount: row.lineCount,
    total: row.total.toFixed(2),
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The customer of this phone, else a new one with the name typed (RG-BOR-03, RG-DEV-04). */
async function customerFor(db: Db, actor: Actor, basket: { name: string; phone: string }) {
  const known = await db.customer.findFirst({
    where: { isActive: true, OR: [{ phone: basket.phone }, { secondPhone: basket.phone }] },
    select: { id: true },
  });
  if (known) return known.id;
  return (await createCustomer(db, actor, { name: basket.name, phone: basket.phone })).id;
}

/**
 * A salesperson takes a basket (RG-BOR-05): locked to them, it becomes a quote in their name for
 * the customer of its phone, without discount; they check it with the customer on their tablet.
 */
export async function takeBasket(db: Db, actor: Actor, id: string): Promise<string> {
  const claimed = await db.kioskBasket.updateMany({
    where: { id, takenById: null, day: shopDateValue(new Date()) },
    data: { takenById: actor.userId },
  });
  if (claimed.count === 0) throw new AppError(409, 'KIOSK_BASKET_TAKEN');
  try {
    const basket = await db.kioskBasket.findUniqueOrThrow({ where: { id } });
    const lines = z.array(kioskBasketLineSchema).parse(basket.lines);
    const quote = await createQuote(db, actor, {
      customerId: await customerFor(db, actor, basket),
      lines: lines.map((line) => ({ ...line, discount: null })),
      orderDiscount: null,
    });
    await db.kioskBasket.update({ where: { id }, data: { orderId: quote.id } });
    return quote.id;
  } catch (error) {
    // Released for another try: a price withdrawn meanwhile must not hide the basket.
    await db.kioskBasket.update({ where: { id }, data: { takenById: null } });
    throw error;
  }
}
