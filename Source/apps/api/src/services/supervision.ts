import {
  IN_PROGRESS_STATUSES,
  PAID_UNDELIVERED_STATUSES,
  type SupervisionToday,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { shopDayStart } from './shop-time.js';

/** The mean of the waits, in whole minutes; null without any. */
function averageMinutes(waits: readonly number[]): number | null {
  if (waits.length === 0) return null;
  const mean = waits.reduce((sum, wait) => sum + wait, 0) / waits.length;
  return Math.max(0, Math.round(mean / 60_000));
}

/**
 * The manager's day at a glance (RG-DSP-04, ⚠️ H38). The register wait runs from validation to
 * the call, over the orders called since the shop's day began (a customer absent then called
 * again counts once, their whole wait); the delivery wait from payment to the first counter
 * taking the order, over the orders first taken today. The counts are those of right now.
 */
export async function loadToday(db: Db, now = new Date()): Promise<SupervisionToday> {
  const since = shopDayStart(now);
  const [called, taken, inProgress, undelivered] = await Promise.all([
    db.order.findMany({
      where: { calledAt: { gte: since }, submittedAt: { not: null } },
      select: { submittedAt: true, calledAt: true },
    }),
    // A released or requeued order is taken again: only its first counter counts.
    db.delivery.findMany({
      where: {
        startedAt: { gte: since },
        order: { deliveries: { none: { startedAt: { lt: since } } } },
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: { orderId: true, startedAt: true, order: { select: { paidAt: true } } },
    }),
    db.order.count({ where: { status: { in: [...IN_PROGRESS_STATUSES] } } }),
    db.order.aggregate({
      where: { status: { in: [...PAID_UNDELIVERED_STATUSES] } },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ]);
  const firstTaken = new Map<string, number>();
  for (const { orderId, startedAt, order } of taken) {
    if (firstTaken.has(orderId) || !order.paidAt) continue;
    firstTaken.set(orderId, startedAt.getTime() - order.paidAt.getTime());
  }
  return {
    registerWait: averageMinutes(
      called.flatMap(({ submittedAt, calledAt }) =>
        submittedAt && calledAt ? [calledAt.getTime() - submittedAt.getTime()] : [],
      ),
    ),
    deliveryWait: averageMinutes([...firstTaken.values()]),
    inProgress,
    paidUndelivered: {
      count: undelivered._count._all,
      total: undelivered._sum.total?.toFixed(2) ?? '0.00',
    },
  };
}
