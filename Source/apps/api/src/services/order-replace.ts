import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { nextQuoteNumber } from './quotes.js';

/**
 * A document changed after it left the shop's hands takes a new number (H69): a handed-over quote
 * saved again, an order changed at the register, sent back or refused at reactivation. The order
 * keeps its row — ticket, place in the queue, reservations, requests and codes stay with it — under
 * a new number; the old number stays on a REPLACED copy of it as it was, pointing to the new one.
 * Run first in the transaction that changes the order, so a refused change undoes it too.
 */
export async function replaceNumber(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string,
  prefix: string,
): Promise<void> {
  const old = await tx.order.findUnique({ where: { id }, include: { lines: true } });
  if (!old) throw new AppError(404, 'NOT_FOUND');
  const number = await nextQuoteNumber(tx, prefix);
  await tx.order.update({ where: { id }, data: { number, handedAt: null, createdAt: new Date() } });
  await tx.order.create({
    data: {
      number: old.number,
      status: 'REPLACED',
      replacedById: id,
      salesUserId: old.salesUserId,
      customerId: old.customerId,
      subtotal: old.subtotal,
      orderDiscountPct: old.orderDiscountPct,
      orderDiscountAmount: old.orderDiscountAmount,
      orderDiscountSource: old.orderDiscountSource,
      discountTotal: old.discountTotal,
      vatTotal: old.vatTotal,
      rounding: old.rounding,
      total: old.total,
      createdAt: old.createdAt,
      lines: {
        create: old.lines.map(
          ({ id: _id, orderId: _order, discountCodeId: _code, ...line }) => line,
        ),
      },
    },
  });
  await recordAudit(tx, {
    ...by(actor),
    action: 'order.replaced',
    entityType: 'order',
    entityId: id,
    before: { number: old.number },
    after: { number },
  });
}
