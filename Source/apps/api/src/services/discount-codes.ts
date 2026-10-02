import { randomInt } from 'node:crypto';

import {
  DISCOUNT_CODE_ALPHABET,
  groupDiscountCode,
  type DiscountCode,
  type DiscountCodeIssue,
  type DiscountEntry,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { dayEndTime } from './orders.js';
import { assertActiveCustomer } from './quotes.js';
import { readPositiveIntSetting } from './settings.js';
import { nextShopTime, shopDayStart } from './shop-time.js';

/** Default of `discount_code.length` (CDC métier §13). */
const DEFAULT_LENGTH = 8;
/** Under 6 characters a code is guessed; 12 and their hyphens fill `VARCHAR(16)`. */
const MIN_LENGTH = 6;
const MAX_LENGTH = 12;
/** A code drawn again when it happens to exist already: at most this many draws. */
export const DRAWS = 5;

const select = {
  id: true,
  code: true,
  status: true,
  orderId: true,
  issuedAt: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  items: {
    select: { pct: true, amount: true, product: { select: { id: true, sku: true, name: true } } },
  },
} satisfies Prisma.DiscountCodeSelect;
type StoredCode = Prisma.DiscountCodeGetPayload<{ select: typeof select }>;

const iso = (at: Date | null) => at?.toISOString() ?? null;

function grantOf(item: { pct: Prisma.Decimal | null; amount: Prisma.Decimal | null }) {
  return item.pct
    ? ({ kind: 'pct', value: item.pct.toFixed(2) } as const)
    : ({ kind: 'amount', value: item.amount!.toFixed(2) } as const);
}

function toView(row: StoredCode): DiscountCode {
  // Products by code, the total last.
  const items = row.items
    .map((item) => ({ product: item.product, discount: grantOf(item) }))
    .sort((a, b) => (a.product?.sku ?? '￿').localeCompare(b.product?.sku ?? '￿'));
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    customer: row.customer,
    orderId: row.orderId,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    usedAt: iso(row.usedAt),
    revokedAt: iso(row.revokedAt),
    items,
  };
}

/** A code of `length` characters from the unambiguous alphabet (H41), grouped by 4. */
export function drawCode(length: number): string {
  let raw = '';
  for (let i = 0; i < length; i++) {
    raw += DISCOUNT_CODE_ALPHABET.charAt(randomInt(DISCOUNT_CODE_ALPHABET.length));
  }
  return groupDiscountCode(raw);
}

export async function codeLength(db: Db): Promise<number> {
  const length = await readPositiveIntSetting(db, 'discount_code.length', DEFAULT_LENGTH);
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, length));
}

export const stored = (entry: DiscountEntry) =>
  entry.kind === 'pct' ? { pct: entry.value } : { amount: entry.value };

const isTaken = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Issues a code without a request (RG-REM-04, H41): for an active customer, on active products
 * and/or the total, valid until the next day end; journaled with what it grants.
 */
export async function issueDiscountCode(
  db: Db,
  actor: Actor,
  input: DiscountCodeIssue,
  now = new Date(),
): Promise<DiscountCode> {
  await assertActiveCustomer(db, input.customerId);
  const productIds = input.items.flatMap((item) => item.productId ?? []);
  const onSale = await db.product.count({ where: { id: { in: productIds }, isActive: true } });
  if (onSale !== productIds.length) throw new AppError(422, 'DISCOUNT_CODE_PRODUCT_UNAVAILABLE');
  const [length, dayEnd] = await Promise.all([codeLength(db), dayEndTime(db)]);
  const expiresAt = nextShopTime(now, dayEnd);
  const items = input.items.map((item) => ({
    productId: item.productId,
    ...stored(item.discount),
  }));

  for (let draw = 1; ; draw++) {
    try {
      return await db.$transaction(async (tx) => {
        const row = await tx.discountCode.create({
          data: {
            code: drawCode(length),
            customerId: input.customerId,
            issuedById: actor.userId,
            issuedAt: now,
            expiresAt,
            items: { create: items },
          },
          select,
        });
        await recordAudit(tx, {
          ...by(actor),
          action: 'discount_code.issued',
          entityType: 'discount_code',
          entityId: row.id,
          // The code itself stays on its row: the log refuses anything named like a secret.
          after: { customerId: input.customerId, expiresAt: iso(expiresAt), items },
        });
        return toView(row);
      });
    } catch (error) {
      if (draw < DRAWS && isTaken(error)) continue;
      throw error;
    }
  }
}

/** The codes issued this shop day and those still active from before, newest first (RG-REM-07). */
export async function listDiscountCodes(db: Db, now = new Date()): Promise<DiscountCode[]> {
  const rows = await db.discountCode.findMany({
    where: { OR: [{ issuedAt: { gte: shopDayStart(now) } }, { status: 'ACTIVE' }] },
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    take: 200,
    select,
  });
  return rows.map(toView);
}

/** The owner withdraws a code not used yet (RG-REM-04); one past its expiry is no longer his. */
export async function revokeDiscountCode(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<DiscountCode> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.discountCode.updateMany({
      where: { id, status: 'ACTIVE', expiresAt: { gt: now } },
      data: { status: 'REVOKED', revokedAt: now },
    });
    if (count === 0) {
      const exists = await tx.discountCode.count({ where: { id } });
      throw exists ? new AppError(409, 'DISCOUNT_CODE_NOT_ACTIVE') : new AppError(404, 'NOT_FOUND');
    }
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_code.revoked',
      entityType: 'discount_code',
      entityId: id,
      before: { status: 'ACTIVE' },
      after: { status: 'REVOKED' },
    });
    return toView(await tx.discountCode.findUniqueOrThrow({ where: { id }, select }));
  });
}

/**
 * Expires the codes past their day end (RG-REM-04), audited as the system's doing; run with the
 * orders' sweep. A used or revoked code keeps its status.
 */
export async function expireDiscountCodes(db: Db, now = new Date()): Promise<number> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; expires_at: Date }[]>`
        UPDATE "discount_codes" SET "status" = 'EXPIRED'
         WHERE "status" = 'ACTIVE' AND "expires_at" <= ${now}
        RETURNING "id", "expires_at"`;
    for (const row of rows) {
      await recordAudit(tx, {
        action: 'discount_code.expired',
        entityType: 'discount_code',
        entityId: row.id,
        before: { status: 'ACTIVE', expiresAt: row.expires_at.toISOString() },
        after: { status: 'EXPIRED' },
      });
    }
    return rows.length;
  });
}
