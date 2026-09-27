import {
  demandByProduct,
  shortProducts,
  type StockDemandLine,
  type StockShortage,
  type StockUnavailable,
} from '@vente-web/shared';

import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';

/** A line of the order as the stock check sees it, with what the refusal names. */
export interface ReservedLine extends StockDemandLine {
  sku: string;
  name: string;
  baseUnit: string;
}

export interface ProductReservation {
  productId: string;
  sku: string;
  /** Base unit. */
  qty: string;
}

/**
 * Reserves, for a validated order, the base quantity of each of its products (RG-CMD-02,
 * RG-STK-02), or refuses the whole order naming every product short of stock.
 *
 * The stock rows are locked in product order before being read: two orders sharing products
 * queue up instead of both seeing the same last units, and never deadlock. The available stock
 * already deducts every order validated and not delivered (RG-STK-01), since each one added
 * its quantities to `reserved`. One reservation per product, its lines summed, until `expiresAt`.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  lines: readonly ReservedLine[],
  expiresAt: Date,
): Promise<ProductReservation[]> {
  const demand = demandByProduct(lines);
  const ids = demand.map((product) => product.productId).sort();
  const rows = await tx.$queryRaw<{ product_id: string; available: string }[]>`
    SELECT "product_id", ("on_hand" - "reserved")::text AS "available"
    FROM "product_stock"
    WHERE "product_id" = ANY(${ids}::uuid[])
    ORDER BY "product_id"
    FOR UPDATE`;
  const available = new Map(rows.map((row) => [row.product_id, row.available]));

  const short = shortProducts(demand, available);
  if (short.length > 0) {
    const shortages = short.map((product): StockShortage => {
      const line = lines.find((candidate) => candidate.productId === product.productId);
      return {
        ...product,
        sku: line?.sku ?? '',
        name: line?.name ?? '',
        baseUnit: line?.baseUnit ?? '',
      };
    });
    throw new AppError(409, 'STOCK_UNAVAILABLE', { shortages } satisfies StockUnavailable);
  }

  for (const product of demand) {
    await tx.productStock.update({
      where: { productId: product.productId },
      data: { reserved: { increment: product.baseQty } },
    });
  }
  await tx.reservation.createMany({
    data: demand.map((product) => ({
      orderId,
      productId: product.productId,
      qty: product.baseQty,
      expiresAt,
    })),
  });
  return demand.map((product) => ({
    productId: product.productId,
    sku: lines.find((line) => line.productId === product.productId)?.sku ?? '',
    qty: product.baseQty,
  }));
}

/**
 * The reservations of an order brought to what its lines now ask (RG-STK-01): a product whose
 * lines were lowered frees the difference, one left without any line frees it all. Nothing is
 * ever added here — only the salesperson validates more (RG-CMD-05b).
 */
export async function shrinkReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
  lines: readonly StockDemandLine[],
): Promise<void> {
  const asked = new Map(demandByProduct(lines).map((product) => [product.productId, product]));
  const active = await tx.reservation.findMany({ where: { orderId, status: 'ACTIVE' } });
  for (const reservation of active) {
    const now = asked.get(reservation.productId)?.baseQty ?? '0.00';
    const freed = reservation.qty.minus(now);
    if (freed.lte(0)) continue;
    await tx.productStock.update({
      where: { productId: reservation.productId },
      data: { reserved: { decrement: freed } },
    });
    await tx.reservation.update({
      where: { id: reservation.id },
      data: now === '0.00' ? { status: 'RELEASED', closedAt: new Date() } : { qty: now },
    });
  }
}

/** Every active reservation of an order given back to the available stock (RG-ANN-01, RG-STK-01). */
export async function releaseReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await shrinkReservations(tx, orderId, []);
}
