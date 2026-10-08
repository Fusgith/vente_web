import type {
  CodeGrant,
  DiscountEntry,
  DiscountRequest,
  DiscountRequestGrant,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { codeLength, drawCode, DRAWS, stored } from './discount-codes.js';
import { findRequest, lockOrder } from './discount-requests.js';
import { suggestedOn } from './discount-rules.js';
import { snapshot as orderSnapshot, withCode, writeGrants } from './order-changes.js';
import { findOrder, toOrder, toQuote, usedCode, type StoredOrder } from './order-view.js';
import { dayEndTime } from './orders.js';
import { useCode } from './quote-codes.js';
import { assertNotFree, snapshot as quoteSnapshot } from './quotes.js';
import { nextShopTime } from './shop-time.js';

/** Where the owner's grant still goes: the request is closed with the order otherwise. */
const GRANTABLE = new Set(['DRAFT', 'SUBMITTED', 'AT_REGISTER']);

const decided = (entry: DiscountEntry) =>
  entry.kind === 'pct' ? { decidedPct: entry.value } : { decidedAmount: entry.value };

/** The audit's view of the order, as a quote while it is one. */
const audited = (order: StoredOrder) =>
  order.status === 'DRAFT' ? quoteSnapshot(toQuote(order)) : orderSnapshot(toOrder(order));

/**
 * The code that carries the grants, issued for the order and its customer (H17), its characters
 * drawn again when taken — `ON CONFLICT DO NOTHING` keeps the transaction alive.
 */
async function insertCode(
  tx: AuditTx,
  actor: Actor,
  order: StoredOrder,
  requestId: string,
  { length, expiresAt, now }: { length: number; expiresAt: Date; now: Date },
): Promise<string> {
  for (let draw = 1; draw <= DRAWS; draw++) {
    const { count } = await tx.discountCode.createMany({
      data: [
        {
          code: drawCode(length),
          orderId: order.id,
          customerId: order.customerId,
          requestId,
          issuedById: actor.userId,
          issuedAt: now,
          expiresAt,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 1) {
      const { id } = await tx.discountCode.findUniqueOrThrow({
        where: { requestId },
        select: { id: true },
      });
      return id;
    }
  }
  throw new Error('No free discount code after several draws');
}

/**
 * The owner grants a request item by item (RG-REM-03/05, H53): as asked, otherwise, or not at
 * all — one item at least. The grants become a code issued for this order and used on it at once
 * (H17), applied as a code typed at the register (H42) on the saved prices, beyond the caps. A
 * grant that covers nothing left on the order, or that would make it free (H50), is refused and the
 * request stays pending.
 */
export async function grantDiscountRequest(
  db: Db,
  actor: Actor,
  id: string,
  { items }: DiscountRequestGrant,
  now = new Date(),
): Promise<DiscountRequest> {
  const head = await db.discountRequest.findUnique({ where: { id }, select: { orderId: true } });
  if (!head) throw new AppError(404, 'NOT_FOUND');
  const [length, dayEnd] = await Promise.all([codeLength(db), dayEndTime(db)]);
  const expiresAt = nextShopTime(now, dayEnd);

  return db.$transaction(async (tx) => {
    await lockOrder(tx, head.orderId);
    const { count } = await tx.discountRequest.updateMany({
      where: { id, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'GRANTED', decidedById: actor.userId, decidedAt: now },
    });
    if (count === 0) throw new AppError(409, 'DISCOUNT_REQUEST_NOT_PENDING');
    const order = await findOrder(tx, head.orderId);
    if (!order) throw new AppError(404, 'NOT_FOUND');
    // A request closes with its order and is never made once a code is used: defensive only.
    if (!GRANTABLE.has(order.status) || usedCode(order)) {
      throw new AppError(409, 'DISCOUNT_REQUEST_NOT_PENDING');
    }

    // Every item of the request answered once (the schema refuses the same item twice).
    const asked = await tx.discountRequestItem.findMany({
      where: { requestId: id },
      select: { id: true, productId: true },
    });
    const answers = new Map(items.map((item) => [item.itemId, item.discount]));
    if (asked.length !== answers.size || asked.some((item) => !answers.has(item.id))) {
      throw new AppError(400, 'BAD_REQUEST');
    }
    const grants: CodeGrant[] = asked.flatMap((item) => {
      const discount = answers.get(item.id);
      return discount ? [{ productId: item.productId, discount }] : [];
    });
    const applied = withCode(
      order,
      grants,
      'DISCOUNT_REQUEST_NOTHING_COVERED',
      await suggestedOn(tx, order, now),
    );
    assertNotFree(applied.totals, 'DISCOUNT_REQUEST_FREE_ORDER');

    const codeId = await insertCode(tx, actor, order, id, { length, expiresAt, now });
    const codeItems = grants.map((grant) => ({
      productId: grant.productId,
      ...stored(grant.discount),
    }));
    await tx.discountCodeItem.createMany({ data: codeItems.map((item) => ({ ...item, codeId })) });
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_code.issued',
      entityType: 'discount_code',
      entityId: codeId,
      // The code itself stays on its row: the log refuses anything named like a secret.
      after: {
        customerId: order.customerId,
        orderId: order.id,
        requestId: id,
        expiresAt: expiresAt.toISOString(),
        items: codeItems,
      },
    });
    await useCode(tx, actor, codeId, order.id, now);
    await writeGrants(tx, order, applied, codeId);
    for (const item of asked) {
      const discount = answers.get(item.id);
      if (discount) {
        await tx.discountRequestItem.update({ where: { id: item.id }, data: decided(discount) });
      }
    }

    const after = await findOrder(tx, order.id);
    if (!after) throw new AppError(404, 'NOT_FOUND');
    await recordAudit(tx, {
      ...by(actor),
      action: 'discount_request.granted',
      entityType: 'discount_request',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: 'GRANTED', orderId: order.id, items: codeItems },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: order.status === 'DRAFT' ? 'quote.updated' : 'order.adjusted',
      entityType: 'order',
      entityId: order.id,
      before: audited(order),
      after: audited(after),
    });
    return findRequest(tx, id);
  });
}
