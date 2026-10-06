import type { Promotion, promotionCreateSchema } from '@vente-web/shared';
import type { z } from 'zod';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { shopDateValue } from './shop-time.js';

const select = {
  id: true,
  startsOn: true,
  endsOn: true,
  pitch: true,
  withdrawnAt: true,
  product: { select: { id: true, sku: true, name: true } },
} satisfies Prisma.ProductPromotionSelect;
type StoredPromotion = Prisma.ProductPromotionGetPayload<{ select: typeof select }>;

/** A `date` column holds midnight UTC of the shop's day: `YYYY-MM-DD`. */
const day = (value: Date) => value.toISOString().slice(0, 10);

function toView(row: StoredPromotion): Promotion {
  return {
    ...row,
    startsOn: day(row.startsOn),
    endsOn: day(row.endsOn),
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  };
}

/** Shown on the shop's day `today` (a `date` value): started, not ended, not withdrawn. */
export function currentOn(today: Date) {
  return {
    withdrawnAt: null,
    startsOn: { lte: today },
    endsOn: { gte: today },
  } satisfies Prisma.ProductPromotionWhereInput;
}

/** The current and upcoming promotions, for the owner (T-037). */
export async function listPromotions(db: Db, now = new Date()): Promise<Promotion[]> {
  const rows = await db.productPromotion.findMany({
    where: { withdrawnAt: null, endsOn: { gte: shopDateValue(now) } },
    orderBy: [{ startsOn: 'asc' }, { endsOn: 'asc' }, { createdAt: 'asc' }],
    select,
  });
  return rows.map(toView);
}

/**
 * The owner marks a product « à proposer » (RG-DEV-06 §6, H46, H49 b), audited (RG-AUD-01). Two
 * promotions of one product never overlap, so a hit carries one argument at most.
 */
export async function createPromotion(
  db: Db,
  actor: Actor,
  input: z.output<typeof promotionCreateSchema>,
  now = new Date(),
): Promise<Promotion> {
  // `YYYY-MM-DD` reads as midnight UTC, as the `date` column holds it.
  const startsOn = new Date(input.startsOn);
  const endsOn = new Date(input.endsOn);
  if (endsOn < startsOn || endsOn < shopDateValue(now)) {
    throw new AppError(400, 'PROMOTION_DATES_INVALID');
  }
  const pitch = input.pitch || null;
  return db.$transaction(async (tx) => {
    // The product's row locked: a concurrent promotion of it waits for this one.
    const [product] = await tx.$queryRaw<{ is_active: boolean }[]>`
      SELECT "is_active" FROM "products" WHERE "id" = ${input.productId}::uuid FOR UPDATE`;
    if (!product) throw new AppError(404, 'NOT_FOUND');
    if (!product.is_active) throw new AppError(409, 'PROMOTION_PRODUCT_UNAVAILABLE');
    const overlapping = await tx.productPromotion.count({
      where: {
        productId: input.productId,
        withdrawnAt: null,
        startsOn: { lte: endsOn },
        endsOn: { gte: startsOn },
      },
    });
    if (overlapping > 0) throw new AppError(409, 'PROMOTION_OVERLAP');
    const created = await tx.productPromotion.create({
      data: { productId: input.productId, startsOn, endsOn, pitch, createdById: actor.userId },
      select,
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'promotion.created',
      entityType: 'product_promotion',
      entityId: created.id,
      after: { productId: input.productId, startsOn: input.startsOn, endsOn: input.endsOn, pitch },
    });
    return toView(created);
  });
}

/** The owner withdraws a promotion before its end: the tablets stop showing it (H49 b). */
export async function withdrawPromotion(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<Promotion> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.productPromotion.updateMany({
      where: { id, withdrawnAt: null, endsOn: { gte: shopDateValue(now) } },
      data: { withdrawnAt: now },
    });
    if (count === 0) {
      const exists = await tx.productPromotion.count({ where: { id } });
      throw exists ? new AppError(409, 'PROMOTION_NOT_CURRENT') : new AppError(404, 'NOT_FOUND');
    }
    await recordAudit(tx, {
      ...by(actor),
      action: 'promotion.withdrawn',
      entityType: 'product_promotion',
      entityId: id,
      before: { withdrawnAt: null },
      after: { withdrawnAt: now.toISOString() },
    });
    return toView(await tx.productPromotion.findUniqueOrThrow({ where: { id }, select }));
  });
}
