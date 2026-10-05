import { OPEN_ORDER_STATUSES, type OrderListQuery, type OrderSummaryList } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Actor } from './actor.js';
import { readPositiveIntSetting } from './settings.js';
import { shopDayStart } from './shop-time.js';

/** The most a list shows: an older quote is found by its number (RG-DEV-03). */
const LIST_LIMIT = 100;

/**
 * The quotes and orders still open — to take up again, have paid or reactivate (RG-DEV-02/03,
 * RG-CMD-08, H56): the salesperson's own, everyone's for the manager, the latest changed first;
 * a colleague's quote found by its number. A quote past its validity is told outdated (RG-DEV-02).
 */
export async function listOpenOrders(
  db: Db,
  actor: Actor,
  { number }: OrderListQuery,
  now = new Date(),
): Promise<OrderSummaryList> {
  const wanted = number?.replace(/\s+/g, '');
  const [rows, validityDays] = await Promise.all([
    db.order.findMany({
      where: {
        status: { in: [...OPEN_ORDER_STATUSES] },
        ...(wanted
          ? { number: { equals: wanted, mode: 'insensitive' } }
          : actor.activeRole === 'sales'
            ? { salesUserId: actor.userId }
            : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        number: true,
        version: true,
        status: true,
        customer: { select: { id: true, name: true, phone: true } },
        salesUser: { select: { id: true, fullName: true } },
        total: true,
        ticketLetter: true,
        ticketSeq: true,
        ticketDate: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    readPositiveIntSetting(db, 'quote_validity_days', 7),
  ]);
  return {
    orders: rows.map(({ ticketLetter, ticketSeq, ticketDate, createdAt, updatedAt, ...row }) => ({
      ...row,
      total: row.total.toFixed(2),
      ticket:
        ticketLetter && ticketSeq && ticketDate
          ? { letter: ticketLetter, seq: ticketSeq, date: ticketDate.toISOString().slice(0, 10) }
          : null,
      updatedAt: updatedAt.toISOString(),
      // Valid through its last day (RG-DEV-02): outdated from the next one on.
      outdated: row.status === 'DRAFT' && shopDayStart(createdAt, validityDays + 1) <= now,
    })),
  };
}
