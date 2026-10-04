import type { Order, OrderSubmit } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { atMyRegister } from './order-changes.js';
import { findOrder, toOrder } from './order-view.js';
import { releaseReservations } from './stock-reservation.js';

/**
 * Sent back from the register to its salesperson (RG-CMD-05b, ⚠️ H56) by the cashier who called it
 * or the manager: a quote again, same number, to go over with the customer. It keeps its ticket and
 * its place in the queue for a validation that day; its stock is freed meanwhile.
 */
export async function sendBackOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version }: OrderSubmit,
): Promise<Order> {
  await atMyRegister(db, actor, id, version);
  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, status: 'AT_REGISTER', version },
      data: {
        status: 'DRAFT',
        expiresAt: null,
        cashierUserId: null,
        registerStationId: null,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new AppError(409, 'ORDER_CHANGED');
    await releaseReservations(tx, id);
    const after = await findOrder(tx, id);
    if (!after) throw new AppError(404, 'NOT_FOUND');
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.sent_back',
      entityType: 'order',
      entityId: id,
      before: { status: 'AT_REGISTER' },
      after: { status: 'DRAFT' },
    });
    return toOrder(after);
  });
}
