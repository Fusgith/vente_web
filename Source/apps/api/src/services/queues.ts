import {
  QUEUE_STATUSES,
  type Order,
  type Queue,
  type QueueItem,
  type QueueMove,
  type QueueName,
  type QueuePriority,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { loadOrder } from './orders.js';
import { nextSequenceValue } from './sequences.js';

const ITEM_INCLUDE = {
  customer: { select: { name: true, phone: true } },
  salesUser: { select: { id: true, fullName: true } },
  cashierUser: { select: { id: true, fullName: true } },
  registerStation: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

type StoredItem = Prisma.OrderGetPayload<{ include: typeof ITEM_INCLUDE }>;

function toItem(order: StoredItem): QueueItem[] {
  const { ticketLetter, ticketSeq, ticketDate, submittedAt } = order;
  // An order enters a queue validated, hence with its ticket (RG-CMD-03).
  if (!ticketLetter || !ticketSeq || !ticketDate || !submittedAt) return [];
  return [
    {
      orderId: order.id,
      number: order.number,
      status: order.status,
      ticket: { letter: ticketLetter, seq: ticketSeq, date: ticketDate.toISOString().slice(0, 10) },
      customer: order.customer,
      salesUser: order.salesUser,
      total: order.total.toFixed(2),
      priority: order.priority > 0,
      noShowCount: order.noShowCount,
      submittedAt: submittedAt.toISOString(),
      calledAt: order.calledAt?.toISOString() ?? null,
      servedBy: order.cashierUser,
      station: order.registerStation,
    },
  ];
}

/** Rank key of each queue in `number_sequences`: last place is the next value (RG-FIL-01). */
const RANK_KEY: Record<QueueName, string> = {
  register: 'QUEUE-REGISTER',
  delivery: 'QUEUE-DELIVERY',
};

/** Who is being served, then who waits, in the order they will be called (RG-FIL-01). */
export async function loadQueue(db: Db, queue: QueueName): Promise<Queue> {
  const { waiting, serving } = QUEUE_STATUSES[queue];
  const [waitingRows, servingRows] = await Promise.all([
    db.order.findMany({
      where: { status: { in: [...waiting] } },
      orderBy: [{ queueRank: 'asc' }, { id: 'asc' }],
      include: ITEM_INCLUDE,
    }),
    db.order.findMany({
      where: { status: { in: [...serving] } },
      orderBy: [{ calledAt: 'asc' }, { id: 'asc' }],
      include: ITEM_INCLUDE,
    }),
  ]);
  return { queue, serving: servingRows.flatMap(toItem), waiting: waitingRows.flatMap(toItem) };
}

/**
 * One customer at a time at a register (H29): the caller's own row locked, two taps call one
 * ticket.
 */
async function assertRegisterFree(tx: Prisma.TransactionClient, actor: Actor): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "users" WHERE "id" = ${actor.userId}::uuid FOR UPDATE`;
  const busy = await tx.order.findFirst({
    where: { status: 'AT_REGISTER', cashierUserId: actor.userId },
    select: { id: true },
  });
  if (busy) throw new AppError(409, 'REGISTER_BUSY');
}

/**
 * Calls a ticket to the caller's register (RG-FIL-03): the first waiting one, or `id` when the
 * customer stands in front of the cashier — audited as such. Two registers calling at the same
 * moment never get the same ticket: a row being called is skipped, and the call is guarded on
 * the order still waiting.
 */
export async function callToRegister(db: Db, actor: Actor, id: string | null): Promise<Order> {
  return db.$transaction(async (tx) => {
    await assertRegisterFree(tx, actor);
    let orderId = id;
    if (orderId === null) {
      const [first] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "orders" WHERE "status" = 'SUBMITTED'
         ORDER BY "queue_rank", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!first) throw new AppError(409, 'QUEUE_EMPTY');
      orderId = first.id;
    }
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: 'SUBMITTED' },
      data: {
        status: 'AT_REGISTER',
        calledAt: new Date(),
        cashierUserId: actor.userId,
        registerStationId: actor.stationId,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new AppError(409, 'ORDER_NOT_IN_QUEUE');
    const order = await loadOrder(tx, orderId);
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.called',
      entityType: 'order',
      entityId: orderId,
      before: { status: 'SUBMITTED' },
      after: { status: 'AT_REGISTER', stationId: actor.stationId },
      reason: id === null ? null : 'specific_ticket',
    });
    return order;
  });
}

/**
 * The customer called did not come (RG-FIL-04): the order goes back to the end of the queue,
 * its reservation still running, one more absence counted and its priority lost (RG-FIL-02).
 * Only the register that called it, or the manager, says so.
 */
export async function markNoShow(
  db: Db,
  actor: Actor,
  id: string,
): Promise<{ order: Order; noShowCount: number }> {
  return db.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id },
      select: { status: true, cashierUserId: true, noShowCount: true, priority: true },
    });
    if (!current) throw new AppError(404, 'NOT_FOUND');
    const own = actor.activeRole === 'manager' || current.cashierUserId === actor.userId;
    if (current.status !== 'AT_REGISTER' || !own) {
      throw new AppError(409, 'ORDER_NOT_AT_REGISTER');
    }
    const { count } = await tx.order.updateMany({
      where: { id, status: 'AT_REGISTER', noShowCount: current.noShowCount },
      data: {
        status: 'SUBMITTED',
        queueRank: await nextSequenceValue(tx, RANK_KEY.register),
        noShowCount: { increment: 1 },
        priority: 0,
        cashierUserId: null,
        registerStationId: null,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new AppError(409, 'ORDER_NOT_AT_REGISTER');
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.no_show',
      entityType: 'order',
      entityId: id,
      before: {
        status: 'AT_REGISTER',
        noShowCount: current.noShowCount,
        priority: current.priority > 0,
      },
      after: { status: 'SUBMITTED', noShowCount: current.noShowCount + 1, priority: false },
    });
    return { order: await loadOrder(tx, id), noShowCount: current.noShowCount + 1 };
  });
}

interface Waiting {
  id: string;
  priority: number;
}

/** The waiting orders of a queue, locked, in their calling order. */
async function lockWaiting(tx: Prisma.TransactionClient, queue: QueueName): Promise<Waiting[]> {
  const statuses = QUEUE_STATUSES[queue].waiting.map(String);
  return tx.$queryRaw<Waiting[]>`
    SELECT "id", "priority" FROM "orders"
     WHERE "status"::text = ANY(${statuses})
     ORDER BY "queue_rank", "id" FOR UPDATE`;
}

/** Ranks 1…n in the new order; orders entering later take the next value, hence stay behind. */
async function rerank(tx: AuditTx, ids: readonly string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await tx.order.update({ where: { id }, data: { queueRank: index + 1 } });
  }
}

function positionOf(ids: readonly string[], id: string): number {
  const index = ids.indexOf(id);
  if (index < 0) throw new AppError(409, 'ORDER_NOT_IN_QUEUE');
  return index + 1;
}

/**
 * The manager places an order before another one, or last (RG-FIL-02); audited with a reason.
 * Placed last, a priority order loses its priority.
 */
export async function moveInQueue(
  db: Db,
  actor: Actor,
  queue: QueueName,
  { orderId, beforeId, reason }: QueueMove,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const rows = await lockWaiting(tx, queue);
    const ids = rows.map((row) => row.id);
    const from = positionOf(ids, orderId);
    const wasPriority = (rows[from - 1]?.priority ?? 0) > 0;
    const rest = ids.filter((id) => id !== orderId);
    const at = beforeId === null ? rest.length : positionOf(rest, beforeId) - 1;
    const next = [...rest.slice(0, at), orderId, ...rest.slice(at)];
    await rerank(tx, next);
    const priority = wasPriority && beforeId !== null;
    if (wasPriority && !priority) {
      await tx.order.update({ where: { id: orderId }, data: { priority: 0 } });
    }
    await recordAudit(tx, {
      ...by(actor),
      action: 'queue.reordered',
      entityType: 'order',
      entityId: orderId,
      before: { queue, position: from, priority: wasPriority },
      after: { queue, position: at + 1, priority },
      reason: reason || null,
    });
  });
}

/**
 * Marks an order priority, or no longer (RG-FIL-02, H29). Marked, it moves behind the other priority
 * orders, ahead of all the others; unmarked, it keeps its place.
 */
export async function setPriority(
  db: Db,
  actor: Actor,
  queue: QueueName,
  { orderId, priority, reason }: QueuePriority,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const rows = await lockWaiting(tx, queue);
    const ids = rows.map((row) => row.id);
    const from = positionOf(ids, orderId);
    let to = from;
    if (priority) {
      const rest = rows.filter((row) => row.id !== orderId);
      const lead = rest.filter((row) => row.priority > 0).map((row) => row.id);
      const others = rest.filter((row) => row.priority <= 0).map((row) => row.id);
      await rerank(tx, [...lead, orderId, ...others]);
      to = lead.length + 1;
    }
    await tx.order.update({ where: { id: orderId }, data: { priority: priority ? 1 : 0 } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'queue.priority_set',
      entityType: 'order',
      entityId: orderId,
      before: { queue, position: from, priority: (rows[from - 1]?.priority ?? 0) > 0 },
      after: { queue, position: to, priority },
      reason: reason || null,
    });
  });
}
