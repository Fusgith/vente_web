import { EXPORT_VALUES as words, ROLE_LABELS } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Rows } from './export-book.js';
import type { Span } from './exports-sales.js';
import { defaultDiscountCap, inForceAt, unitCap } from './product-hits.js';

/** Excel refuses a cell over 32 767 characters. */
const CELL_MAX = 32_000;
const json = (value: unknown) =>
  value === null || value === undefined ? '' : JSON.stringify(value).slice(0, CELL_MAX);

/** Each movement in base unit, with the unit and quantity typed (RG-EXP-01, RG-STK-01). */
export async function movementRows(db: Db, createdAt: Span): Promise<Rows[]> {
  const movements = await db.stockMovement.findMany({
    where: { createdAt },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      createdAt: true,
      type: true,
      qty: true,
      unitQty: true,
      reason: true,
      product: { select: { sku: true, name: true, baseUnit: true } },
      productUnit: { select: { label: true } },
      order: { select: { number: true } },
      user: { select: { fullName: true } },
    },
  });
  return [
    movements.map((movement) => [
      movement.createdAt,
      words.movementType[movement.type] ?? movement.type,
      movement.product.sku,
      movement.product.name,
      movement.qty.toFixed(2),
      movement.product.baseUnit,
      movement.productUnit?.label ?? '',
      movement.unitQty?.toFixed(2) ?? null,
      movement.order?.number ?? '',
      movement.reason,
      movement.user.fullName,
    ]),
  ];
}

/** Each active product's stock now, valued at the price in force of its base unit (RG-EXP-01). */
export async function stockRows(db: Db): Promise<Rows[]> {
  const now = new Date();
  const products = await db.product.findMany({
    where: { isActive: true },
    orderBy: { sku: 'asc' },
    select: {
      sku: true,
      name: true,
      baseUnit: true,
      alertThreshold: true,
      lastEntryAt: true,
      category: { select: { name: true } },
      stock: { select: { onHand: true, reserved: true } },
      units: {
        where: { isBase: true },
        take: 1,
        select: {
          prices: {
            where: inForceAt(now),
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
            select: { price: true },
          },
        },
      },
    },
  });
  return [
    products.map((product) => {
      const onHand = product.stock?.onHand;
      const reserved = product.stock?.reserved;
      const price = product.units[0]?.prices[0]?.price ?? null;
      return [
        product.sku,
        product.name,
        product.category?.name ?? '',
        product.baseUnit,
        onHand?.toFixed(2) ?? '0',
        reserved?.toFixed(2) ?? '0',
        onHand && reserved ? onHand.minus(reserved).toFixed(2) : (onHand?.toFixed(2) ?? '0'),
        price?.toFixed(2) ?? null,
        price && onHand ? onHand.times(price).toFixed(2) : null,
        product.alertThreshold?.toFixed(2) ?? null,
        product.lastEntryAt,
      ];
    }),
  ];
}

/** Product × sale unit: factor, price in force, cap resolved now (RG-EXP-01, RG-REM-01). */
export async function priceGridRows(db: Db): Promise<Rows[]> {
  const now = new Date();
  const [units, fallback] = await Promise.all([
    db.productUnit.findMany({
      where: { isActive: true, product: { isActive: true } },
      orderBy: [{ product: { sku: 'asc' } }, { factor: 'asc' }, { label: 'asc' }],
      select: {
        label: true,
        factor: true,
        maxDiscountPct: true,
        product: {
          select: {
            sku: true,
            name: true,
            baseUnit: true,
            maxDiscountPct: true,
            category: { select: { name: true, maxDiscountPct: true } },
          },
        },
        prices: {
          where: inForceAt(now),
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { price: true, effectiveFrom: true },
        },
      },
    }),
    defaultDiscountCap(db),
  ]);
  return [
    units.map((unit) => [
      unit.product.sku,
      unit.product.name,
      unit.product.category?.name ?? '',
      unit.label,
      unit.factor.toFixed(3),
      unit.product.baseUnit,
      unit.prices[0]?.price.toFixed(2) ?? null,
      unit.prices[0]?.effectiveFrom ?? null,
      unitCap(unit, unit.product, fallback),
    ]),
  ];
}

/** The prices taking effect over the period, each against the one before it (RG-ART-07). */
export async function priceHistoryRows(db: Db, period: Span): Promise<Rows[]> {
  const prices = await db.productPrice.findMany({
    where: {
      effectiveFrom: { lt: period.lt },
      productUnit: { prices: { some: { effectiveFrom: period } } },
    },
    orderBy: [{ productUnitId: 'asc' }, { effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    select: {
      productUnitId: true,
      price: true,
      effectiveFrom: true,
      effectiveTo: true,
      source: true,
      importBatch: { select: { fileName: true } },
      setBy: { select: { fullName: true } },
      productUnit: { select: { label: true, product: { select: { sku: true, name: true } } } },
    },
  });
  const rows: { at: Date; row: Rows[number] }[] = [];
  prices.forEach((price, index) => {
    if (price.effectiveFrom < period.gte) return;
    const before = prices[index - 1];
    const previous = before?.productUnitId === price.productUnitId ? before.price : null;
    const moved = previous ? price.price.minus(previous) : null;
    rows.push({
      at: price.effectiveFrom,
      row: [
        price.effectiveFrom,
        price.productUnit.product.sku,
        price.productUnit.product.name,
        price.productUnit.label,
        price.price.toFixed(2),
        previous?.toFixed(2) ?? null,
        moved?.toFixed(2) ?? null,
        previous && moved && !previous.isZero() ? moved.div(previous).times(100).toFixed(2) : null,
        price.effectiveTo,
        price.importBatch
          ? words.importOf(price.importBatch.fileName)
          : (words.priceSource[price.source] ?? price.source),
        price.setBy.fullName,
      ],
    });
  });
  return [rows.sort((a, b) => a.at.getTime() - b.at.getTime()).map(({ row }) => row)];
}

/** The customers' directory, merged records left out (RG-EXP-01, RG-CLI-*). */
export async function customerRows(db: Db): Promise<Rows[]> {
  const customers = await db.customer.findMany({
    where: { mergedIntoId: null },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      name: true,
      phone: true,
      secondPhone: true,
      category: true,
      reservationDays: true,
      notes: true,
      isActive: true,
      createdAt: true,
    },
  });
  return [
    customers.map((customer) => [
      customer.name,
      customer.phone,
      customer.secondPhone,
      customer.category,
      customer.reservationDays,
      customer.notes,
      customer.isActive ? words.yes : words.no,
      customer.createdAt,
    ]),
  ];
}

/** The audit journal of the period, before and after as written (RG-AUD-01, RG-EXP-01). */
export async function auditRows(db: Db, at: Span): Promise<Rows[]> {
  const entries = await db.auditLog.findMany({
    where: { at },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    select: {
      at: true,
      activeRole: true,
      origin: true,
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      reason: true,
      user: { select: { fullName: true } },
      station: { select: { name: true } },
    },
  });
  return [
    entries.map((entry) => [
      entry.at,
      entry.user?.fullName ?? '',
      entry.activeRole ? ROLE_LABELS[entry.activeRole] : '',
      entry.station?.name ?? '',
      entry.origin ? (words.origin[entry.origin] ?? entry.origin) : '',
      entry.action,
      entry.entityType,
      entry.entityId,
      json(entry.before),
      json(entry.after),
      entry.reason,
    ]),
  ];
}
