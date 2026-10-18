import {
  MAX_ACTIVE_UNITS,
  PRODUCT_LIST_PAGE,
  type PriceSet,
  type ProductCreate,
  type ProductDetail,
  type ProductList,
  type ProductUpdate,
  type UnitCreate,
  type UnitUpdate,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';

type Tx = Prisma.TransactionClient;

/** The fields given, for a Prisma update and an audit snapshot (no `undefined` member). */
function defined<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

const decimal = (value: Prisma.Decimal | null | undefined) => value?.toFixed(2) ?? null;

/** A unique index broke: which one decides the message (RG-ART-01, RG-ART-06). */
function conflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta ?? {});
    if (target.includes('barcode')) throw new AppError(409, 'PRODUCT_BARCODE_TAKEN');
    if (target.includes('label')) throw new AppError(409, 'UNIT_LABEL_TAKEN');
    throw new AppError(409, 'PRODUCT_SKU_TAKEN');
  }
  throw error;
}

async function skuTaken(tx: Tx, sku: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "products" WHERE lower("sku") = lower(${sku}) LIMIT 1`;
  return rows.length > 0;
}

async function barcodeTaken(tx: Tx, barcode: string | null, exceptUnit?: string) {
  if (!barcode) return;
  const twin = await tx.productUnit.findFirst({
    where: { barcode, ...(exceptUnit ? { id: { not: exceptUnit } } : {}) },
    select: { id: true },
  });
  if (twin) throw new AppError(409, 'PRODUCT_BARCODE_TAKEN');
}

/** A new current price: the previous one closed at the same instant, never overwritten (RG-ART-07). */
async function setPrice(tx: Tx, actor: Actor, unitId: string, price: string) {
  const now = new Date();
  const current = await tx.productPrice.findFirst({
    where: { productUnitId: unitId, effectiveTo: null },
    select: { id: true, price: true },
  });
  if (current?.price.equals(price)) throw new AppError(409, 'PRICE_UNCHANGED');
  if (current) {
    await tx.productPrice.update({ where: { id: current.id }, data: { effectiveTo: now } });
  }
  await tx.productPrice.create({
    data: {
      productUnitId: unitId,
      price,
      effectiveFrom: now,
      source: 'MANUAL',
      setById: actor.userId,
    },
  });
  return current ? current.price.toFixed(2) : null;
}

async function activeUnits(tx: Tx, productId: string): Promise<number> {
  return tx.productUnit.count({ where: { productId, isActive: true } });
}

export async function listProducts(
  db: Db,
  query: { q?: string | undefined; inactive?: '0' | '1' | undefined; page?: number | undefined },
): Promise<ProductList> {
  const q = query.q?.trim();
  const where: Prisma.ProductWhereInput = {
    ...(query.inactive === '1' ? {} : { isActive: true }),
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const page = query.page ?? 1;
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { sku: 'asc' },
      skip: (page - 1) * PRODUCT_LIST_PAGE,
      take: PRODUCT_LIST_PAGE,
      select: {
        id: true,
        sku: true,
        name: true,
        baseUnit: true,
        isActive: true,
        category: { select: { name: true } },
        stock: { select: { onHand: true, reserved: true } },
        units: {
          where: { isActive: true },
          orderBy: { factor: 'asc' },
          select: {
            label: true,
            factor: true,
            prices: { where: { effectiveTo: null }, select: { price: true } },
          },
        },
      },
    }),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      name: row.name,
      category: row.category?.name ?? null,
      baseUnit: row.baseUnit,
      isActive: row.isActive,
      available: (row.stock
        ? row.stock.onHand.minus(row.stock.reserved)
        : new Prisma.Decimal(0)
      ).toFixed(2),
      units: row.units.map((unit) => ({
        label: unit.label,
        factor: unit.factor.toString(),
        price: decimal(unit.prices[0]?.price),
      })),
    })),
  };
}

export async function loadProduct(db: Db | Tx, id: string): Promise<ProductDetail> {
  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      sku: true,
      name: true,
      baseUnit: true,
      alertThreshold: true,
      isActive: true,
      category: { select: { id: true, name: true } },
      stock: { select: { onHand: true, reserved: true } },
      units: {
        orderBy: [{ isActive: 'desc' }, { factor: 'asc' }],
        select: {
          id: true,
          label: true,
          factor: true,
          isBase: true,
          barcode: true,
          isActive: true,
          _count: { select: { orderLines: true } },
          prices: {
            orderBy: { effectiveFrom: 'desc' },
            select: {
              id: true,
              price: true,
              effectiveFrom: true,
              effectiveTo: true,
              source: true,
              setBy: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });
  if (!product) throw new AppError(404, 'NOT_FOUND');
  const onHand = product.stock?.onHand ?? new Prisma.Decimal(0);
  const reserved = product.stock?.reserved ?? new Prisma.Decimal(0);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    baseUnit: product.baseUnit,
    alertThreshold: decimal(product.alertThreshold),
    isActive: product.isActive,
    onHand: onHand.toFixed(2),
    available: onHand.minus(reserved).toFixed(2),
    units: product.units.map((unit) => ({
      id: unit.id,
      label: unit.label,
      factor: unit.factor.toString(),
      isBase: unit.isBase,
      barcode: unit.barcode,
      isActive: unit.isActive,
      price: decimal(unit.prices.find((entry) => entry.effectiveTo === null)?.price),
      used: unit._count.orderLines > 0,
      prices: unit.prices.map((entry) => ({
        id: entry.id,
        price: entry.price.toFixed(2),
        effectiveFrom: entry.effectiveFrom.toISOString(),
        effectiveTo: entry.effectiveTo?.toISOString() ?? null,
        source: entry.source,
        setBy: entry.setBy.fullName,
      })),
    })),
  };
}

/** A product and its base unit, factor 1, with its first price if given (RG-ART-01/06, H65). */
export async function createProduct(db: Db, actor: Actor, input: ProductCreate): Promise<string> {
  try {
    return await db.$transaction(async (tx) => {
      if (await skuTaken(tx, input.sku)) throw new AppError(409, 'PRODUCT_SKU_TAKEN');
      await barcodeTaken(tx, input.barcode ?? null);
      const product = await tx.product.create({
        data: {
          sku: input.sku,
          name: input.name,
          categoryId: input.categoryId,
          baseUnit: input.baseUnit,
          alertThreshold: input.alertThreshold,
        },
        select: { id: true },
      });
      const unit = await tx.productUnit.create({
        data: {
          productId: product.id,
          label: input.baseUnit,
          factor: 1,
          isBase: true,
          barcode: input.barcode ?? null,
        },
        select: { id: true },
      });
      if (input.price) await setPrice(tx, actor, unit.id, input.price);
      await recordAudit(tx, {
        ...by(actor),
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        after: {
          sku: input.sku,
          name: input.name,
          baseUnit: input.baseUnit,
          alertThreshold: input.alertThreshold,
          price: input.price,
        },
      });
      return product.id;
    });
  } catch (error) {
    return conflict(error);
  }
}

export async function updateProduct(
  db: Db,
  actor: Actor,
  id: string,
  input: ProductUpdate,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.product.findUnique({
      where: { id },
      select: { name: true, categoryId: true, alertThreshold: true, isActive: true },
    });
    if (!before) throw new AppError(404, 'NOT_FOUND');
    await tx.product.update({ where: { id }, data: defined(input) });
    await recordAudit(tx, {
      ...by(actor),
      action: 'product.updated',
      entityType: 'product',
      entityId: id,
      before: { ...before, alertThreshold: decimal(before.alertThreshold) },
      after: defined(input),
    });
  });
}

/** A new sale unit; a 4th active one is refused (H65). */
export async function addUnit(db: Db, actor: Actor, productId: string, input: UnitCreate) {
  try {
    await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) throw new AppError(404, 'NOT_FOUND');
      if ((await activeUnits(tx, productId)) >= MAX_ACTIVE_UNITS) {
        throw new AppError(409, 'UNIT_LIMIT_REACHED');
      }
      await barcodeTaken(tx, input.barcode ?? null);
      const unit = await tx.productUnit.create({
        data: {
          productId,
          label: input.label,
          factor: input.factor,
          barcode: input.barcode ?? null,
        },
        select: { id: true },
      });
      if (input.price) await setPrice(tx, actor, unit.id, input.price);
      await recordAudit(tx, {
        ...by(actor),
        action: 'product_unit.created',
        entityType: 'product',
        entityId: productId,
        after: {
          unit: input.label,
          factor: input.factor,
          hasBarcode: Boolean(input.barcode),
          price: input.price,
        },
      });
    });
  } catch (error) {
    conflict(error);
  }
}

/**
 * Renames, re-barcodes, (de)activates a unit; its factor changes only while no order uses it
 * (RG-ART-06); the base unit stays at 1; reactivating counts toward the three (H65).
 */
export async function updateUnit(
  db: Db,
  actor: Actor,
  productId: string,
  unitId: string,
  input: UnitUpdate,
) {
  try {
    await db.$transaction(async (tx) => {
      const unit = await tx.productUnit.findFirst({
        where: { id: unitId, productId },
        select: {
          label: true,
          factor: true,
          barcode: true,
          isActive: true,
          isBase: true,
          _count: { select: { orderLines: true } },
        },
      });
      if (!unit) throw new AppError(404, 'NOT_FOUND');
      if (input.factor !== undefined && !unit.factor.equals(input.factor)) {
        if (unit.isBase) throw new AppError(409, 'UNIT_BASE_FACTOR');
        if (unit._count.orderLines > 0) throw new AppError(409, 'UNIT_FACTOR_FROZEN');
      }
      if (
        input.isActive &&
        !unit.isActive &&
        (await activeUnits(tx, productId)) >= MAX_ACTIVE_UNITS
      ) {
        throw new AppError(409, 'UNIT_LIMIT_REACHED');
      }
      if (input.barcode !== undefined) await barcodeTaken(tx, input.barcode, unitId);
      await tx.productUnit.update({
        where: { id: unitId },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.factor !== undefined ? { factor: input.factor } : {}),
          ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await recordAudit(tx, {
        ...by(actor),
        action: 'product_unit.updated',
        entityType: 'product',
        entityId: productId,
        before: {
          unit: unit.label,
          factor: unit.factor.toString(),
          hasBarcode: unit.barcode !== null,
          isActive: unit.isActive,
        },
        after: defined({
          label: input.label,
          factor: input.factor,
          hasBarcode: input.barcode === undefined ? undefined : input.barcode !== null,
          isActive: input.isActive,
        }),
      });
    });
  } catch (error) {
    conflict(error);
  }
}

/** A new dated price for a unit (RG-ART-03, RG-ART-07), journaled old → new. */
export async function changePrice(
  db: Db,
  actor: Actor,
  productId: string,
  unitId: string,
  input: PriceSet,
) {
  await db.$transaction(async (tx) => {
    const unit = await tx.productUnit.findFirst({
      where: { id: unitId, productId },
      select: { label: true },
    });
    if (!unit) throw new AppError(404, 'NOT_FOUND');
    const previous = await setPrice(tx, actor, unitId, input.price);
    await recordAudit(tx, {
      ...by(actor),
      action: 'product_price.set',
      entityType: 'product',
      entityId: productId,
      before: { unit: unit.label, price: previous },
      after: { unit: unit.label, price: new Prisma.Decimal(input.price).toFixed(2) },
    });
  });
}
