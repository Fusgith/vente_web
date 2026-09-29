import { capRate as rate, type DiscountCaps, type ProductDiscountCaps } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { defaultDiscountCap, unitCap } from './product-hits.js';
import { clearSettingsCache } from './settings.js';

const DEFAULT_KEY = 'default_max_discount_pct';

const own = (value: Prisma.Decimal | null) => value?.toFixed(2) ?? null;

/** The general cap and each active category's (RG-REM-01). */
export async function listDiscountCaps(db: Db): Promise<DiscountCaps> {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, maxDiscountPct: true },
  });
  return {
    defaultPct: rate(await defaultDiscountCap(db)),
    categories: categories.map((category) => ({
      ...category,
      maxDiscountPct: own(category.maxDiscountPct),
    })),
  };
}

/** A product's caps level by level, and what each active sale unit ends up with. */
export async function productDiscountCaps(db: Db, productId: string): Promise<ProductDiscountCaps> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      sku: true,
      name: true,
      maxDiscountPct: true,
      category: { select: { id: true, name: true, maxDiscountPct: true } },
      units: {
        where: { isActive: true },
        orderBy: [{ factor: 'asc' }, { label: 'asc' }],
        select: { id: true, label: true, factor: true, maxDiscountPct: true },
      },
    },
  });
  if (!product) throw new AppError(404, 'NOT_FOUND');
  const fallback = await defaultDiscountCap(db);
  return {
    productId,
    sku: product.sku,
    name: product.name,
    maxDiscountPct: own(product.maxDiscountPct),
    category: product.category && {
      ...product.category,
      maxDiscountPct: own(product.category.maxDiscountPct),
    },
    defaultPct: rate(fallback),
    units: product.units.map((unit) => ({
      id: unit.id,
      label: unit.label,
      factor: unit.factor.toString(),
      maxDiscountPct: own(unit.maxDiscountPct),
      effectivePct: rate(unitCap(unit, product, fallback)),
    })),
  };
}

export type CapHolder = 'product' | 'product_unit' | 'category';

/**
 * The owner sets or clears a unit's, product's or category's own cap (RG-REM-01, H15),
 * journaled before → after. A quote takes it at its next save; a validated order keeps its own (H40).
 */
export async function setDiscountCap(
  db: Db,
  actor: Actor,
  holder: CapHolder,
  id: string,
  pct: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const where = { id };
    const select = { maxDiscountPct: true } as const;
    const current =
      holder === 'product'
        ? await tx.product.findUnique({ where, select })
        : holder === 'product_unit'
          ? await tx.productUnit.findUnique({ where, select })
          : await tx.category.findUnique({ where, select });
    if (!current) throw new AppError(404, 'NOT_FOUND');
    const before = own(current.maxDiscountPct);
    const after = pct === null ? null : rate(pct);
    if (before === after) return;
    const data = { maxDiscountPct: after === null ? null : new Prisma.Decimal(after) };
    if (holder === 'product') await tx.product.update({ where, data });
    else if (holder === 'product_unit') await tx.productUnit.update({ where, data });
    else await tx.category.update({ where, data });
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_cap.set',
      entityType: holder,
      entityId: id,
      before: { maxDiscountPct: before },
      after: { maxDiscountPct: after },
    });
  });
}

/** The general cap, when neither the product nor its category has one (RG-REM-01). */
export async function setDefaultDiscountCap(db: Db, actor: Actor, pct: string): Promise<void> {
  const before = rate(await defaultDiscountCap(db));
  const after = rate(pct);
  if (before === after) return;
  await db.$transaction(async (tx) => {
    // Stored as a JSON number, as the seed and `defaultDiscountCap` read it.
    const value = Number(after);
    await tx.setting.upsert({
      where: { key: DEFAULT_KEY },
      create: { key: DEFAULT_KEY, value, updatedById: actor.userId },
      update: { value, updatedById: actor.userId },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_cap.set',
      entityType: 'setting',
      entityId: DEFAULT_KEY,
      before: { maxDiscountPct: before },
      after: { maxDiscountPct: after },
    });
  });
  clearSettingsCache();
}
