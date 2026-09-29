import {
  baseQuantity,
  type AdjustmentTooLarge,
  type ProductStock,
  type StockAdjustment,
  type StockAlert,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { readSetting } from './settings.js';

/** The seed's list, while the admin has not set `adjustment_reasons` (CDC métier §13). */
const DEFAULT_REASONS = ['Casse', 'Vol', 'Erreur de comptage', 'Périmé', 'Retour fournisseur'];

export async function adjustmentReasons(db: Db): Promise<string[]> {
  const value = await readSetting(db, 'adjustment_reasons');
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((reason) => typeof reason === 'string')
    ? (value as string[])
    : DEFAULT_REASONS;
}

/** Where the product's stock stands, its units and the reasons offered (RG-STK-01, RG-STK-05). */
export async function loadProductStock(db: Db, productId: string): Promise<ProductStock> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      alertThreshold: true,
      stock: { select: { onHand: true, reserved: true } },
      units: {
        where: { isActive: true },
        orderBy: [{ factor: 'asc' }, { label: 'asc' }],
        select: { id: true, label: true, factor: true },
      },
    },
  });
  if (!product) throw new AppError(404, 'NOT_FOUND');
  const onHand = product.stock?.onHand ?? new Prisma.Decimal(0);
  const reserved = product.stock?.reserved ?? new Prisma.Decimal(0);
  return {
    productId,
    onHand: onHand.toFixed(2),
    reserved: reserved.toFixed(2),
    available: onHand.minus(reserved).toFixed(2),
    alertThreshold: product.alertThreshold?.toFixed(2) ?? null,
    units: product.units.map((unit) => ({
      id: unit.id,
      label: unit.label,
      factor: unit.factor.toString(),
    })),
    reasons: await adjustmentReasons(db),
  };
}

/**
 * A manual adjustment (RG-STK-05): one ADJUSTMENT movement in base unit, the stock row moved in
 * the same transaction, the audit trail before → after — never a quantity written over. Goods
 * out never exceed the available stock (RG-STK-06; the goods of validated orders, ⚠️ H39).
 * Returns the new state, and whether the product now sits at or under its threshold.
 */
export async function adjustStock(
  db: Db,
  actor: Actor,
  productId: string,
  input: StockAdjustment,
): Promise<{ stock: ProductStock; low: boolean }> {
  if (!(await adjustmentReasons(db)).includes(input.reason)) {
    throw new AppError(400, 'ADJUSTMENT_REASON_UNKNOWN');
  }
  await db.$transaction(async (tx) => {
    const unit = await tx.productUnit.findFirst({
      where: { id: input.productUnitId, productId, isActive: true },
      select: { label: true, factor: true, product: { select: { baseUnit: true } } },
    });
    if (!unit) throw new AppError(404, 'NOT_FOUND');
    const base = new Prisma.Decimal(baseQuantity(input.qty, unit.factor.toFixed(3)));
    if (base.isZero()) throw new AppError(400, 'VALIDATION_ERROR');

    // The stock row locked: an order validated meanwhile waits, then sees the new stock.
    const [row] = await tx.$queryRaw<{ on_hand: string; reserved: string }[]>`
      SELECT "on_hand"::text AS "on_hand", "reserved"::text AS "reserved"
        FROM "product_stock" WHERE "product_id" = ${productId}::uuid FOR UPDATE`;
    const onHand = new Prisma.Decimal(row?.on_hand ?? 0);
    const reserved = new Prisma.Decimal(row?.reserved ?? 0);
    const available = onHand.minus(reserved);
    if (input.direction === 'out' && base.greaterThan(available)) {
      throw new AppError(409, 'ADJUSTMENT_TOO_LARGE', {
        available: available.toFixed(2),
        baseUnit: unit.product.baseUnit,
      } satisfies AdjustmentTooLarge);
    }

    const qty = input.direction === 'out' ? base.negated() : base;
    await tx.stockMovement.create({
      data: {
        productId,
        type: 'ADJUSTMENT',
        qty,
        productUnitId: input.productUnitId,
        unitQty: new Prisma.Decimal(input.qty),
        userId: actor.userId,
        reason: input.reason,
      },
    });
    // A product never imported has no stock row yet: only goods in can create it.
    if (row) {
      await tx.productStock.update({ where: { productId }, data: { onHand: { increment: qty } } });
    } else {
      await tx.productStock.create({ data: { productId, onHand: qty } });
    }
    await recordAudit(tx, {
      ...by(actor),
      action: 'stock.adjust',
      entityType: 'product',
      entityId: productId,
      before: { onHand: onHand.toFixed(2), reserved: reserved.toFixed(2) },
      after: {
        onHand: onHand.plus(qty).toFixed(2),
        reserved: reserved.toFixed(2),
        direction: input.direction,
        qty: input.qty,
        unit: unit.label,
        baseQty: qty.toFixed(2),
        note: input.note || null,
      },
      reason: input.reason,
    });
  });
  const stock = await loadProductStock(db, productId);
  return { stock, low: (await stockAlerts(db, [productId])).length > 0 };
}

/**
 * Active products whose available stock is at or under their alert threshold, the furthest
 * under first (RG-STK-07); a threshold of zero or none raises no alert. Limited to some
 * products when given, to tell the manager about the ones an operation has just lowered.
 */
export async function stockAlerts(db: Db, productIds?: readonly string[]): Promise<StockAlert[]> {
  const only = productIds ? Prisma.sql`AND p."id" = ANY(${[...productIds]}::uuid[])` : Prisma.empty;
  const rows = await db.$queryRaw<
    {
      id: string;
      sku: string;
      name: string;
      base_unit: string;
      available: string;
      alert_threshold: string;
    }[]
  >`
    SELECT p."id", p."sku", p."name", p."base_unit",
           (s."on_hand" - s."reserved")::text AS "available",
           p."alert_threshold"::text AS "alert_threshold"
      FROM "products" p JOIN "product_stock" s ON s."product_id" = p."id"
     WHERE p."is_active" AND p."alert_threshold" > 0
       AND s."on_hand" - s."reserved" <= p."alert_threshold" ${only}
     ORDER BY (s."on_hand" - s."reserved") / p."alert_threshold", p."sku"`;
  return rows.map((row) => ({
    productId: row.id,
    sku: row.sku,
    name: row.name,
    baseUnit: row.base_unit,
    available: row.available,
    alertThreshold: row.alert_threshold,
  }));
}
