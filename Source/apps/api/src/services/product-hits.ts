import { resolveDiscountCap, type ProductHit } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { readSetting } from './settings.js';

export interface HitOptions {
  /** Discount caps are hidden from roles that may not read them (annexe B). */
  showCaps: boolean;
}

/** `default_max_discount_pct`, the last fallback of RG-REM-01; 0 when unset or malformed. */
export async function defaultDiscountCap(db: Db): Promise<string> {
  const value = await readSetting(db, 'default_max_discount_pct');
  return typeof value === 'number' && value >= 0 && value <= 100 ? String(value) : '0';
}

/** Prices in force at `now`: one scheduled for later does not count yet (RG-ART-07). */
export function inForceAt(now: Date) {
  return {
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
  } satisfies Prisma.ProductPriceWhereInput;
}

interface CapHolder {
  maxDiscountPct: Prisma.Decimal | null;
}

/** Cap of a sale unit in %: unit → product → category → setting (RG-REM-01). */
export function unitCap(
  unit: CapHolder,
  product: CapHolder & { category: CapHolder | null },
  fallback: string,
): string {
  return resolveDiscountCap({
    unit: unit.maxDiscountPct ? decimal(unit.maxDiscountPct) : null,
    product: product.maxDiscountPct ? decimal(product.maxDiscountPct) : null,
    category: product.category?.maxDiscountPct ? decimal(product.category.maxDiscountPct) : null,
    fallback,
  });
}

function hitInclude(now: Date) {
  return {
    category: { select: { id: true, name: true, maxDiscountPct: true } },
    stock: { select: { onHand: true, reserved: true } },
    units: {
      where: { isActive: true },
      orderBy: [{ factor: 'asc' }, { label: 'asc' }],
      include: {
        prices: {
          where: inForceAt(now),
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          select: { price: true },
        },
      },
    },
  } satisfies Prisma.ProductInclude;
}

type ProductWithHit = Prisma.ProductGetPayload<{ include: ReturnType<typeof hitInclude> }>;

function decimal(value: Prisma.Decimal): string {
  return value.toFixed();
}

function toHit(product: ProductWithHit, fallbackCap: string, options: HitOptions): ProductHit {
  const onHand = product.stock?.onHand;
  const reserved = product.stock?.reserved;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category ? { id: product.category.id, name: product.category.name } : null,
    baseUnit: product.baseUnit,
    // Available = on hand − reserved, in base unit (RG-STK-01).
    available: onHand && reserved ? decimal(onHand.minus(reserved)) : '0',
    units: product.units.map((unit) => {
      const price = unit.prices[0]?.price;
      return {
        id: unit.id,
        label: unit.label,
        factor: decimal(unit.factor),
        isBase: unit.isBase,
        barcode: unit.barcode,
        price: price ? decimal(price) : null,
        maxDiscountPct: options.showCaps ? unitCap(unit, product, fallbackCap) : null,
      };
    }),
  };
}

/** Search hits of the given products, in the order of `ids`. */
export async function loadHits(
  db: Db,
  ids: readonly string[],
  options: HitOptions,
): Promise<ProductHit[]> {
  if (ids.length === 0) return [];
  const [products, fallbackCap] = await Promise.all([
    db.product.findMany({ where: { id: { in: [...ids] } }, include: hitInclude(new Date()) }),
    defaultDiscountCap(db),
  ]);
  const byId = new Map(products.map((product) => [product.id, product]));
  return ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [toHit(product, fallbackCap, options)] : [];
  });
}
