import {
  ticketLabel,
  type CustomerType,
  type DiscountEntry,
  type Order,
  type OrderPriceChanged,
  type OrderSubmit,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditSnapshot, type AuditTx } from './audit.js';
import { findOrder, grantsOf, toOrder, usedCode, type StoredOrder } from './order-view.js';
import {
  assertActiveCustomer,
  assertNotFree,
  priceLines,
  totalsWithinCaps,
  type PricedLine,
} from './quotes.js';
import { nextSequenceValue } from './sequences.js';
import { reservationDaysOf } from './reservation-days.js';
import { readSetting } from './settings.js';
import { CLOCK_TIME, nextShopTime, shopDateValue } from './shop-time.js';
import { reserveStock, type ProductReservation } from './stock-reservation.js';

/** Default of `day_end_time` (CDC métier §13, H16). */
const DEFAULT_DAY_END = '23:59';

/** A quote or an order, whatever its state. */
export async function loadOrder(db: AuditTx, id: string): Promise<Order> {
  const order = await findOrder(db, id);
  if (!order) throw new AppError(404, 'NOT_FOUND');
  return toOrder(order);
}

/** The shop day end (`day_end_time`): orders and discount codes expire at it. */
export async function dayEndTime(db: Db): Promise<string> {
  const value = await readSetting(db, 'day_end_time');
  return typeof value === 'string' && CLOCK_TIME.test(value) ? value : DEFAULT_DAY_END;
}

/**
 * Who the order belongs to and whose letter makes its ticket (RG-TKT-01, RG-CMD-01): the
 * salesperson who validates — taking over a colleague's quote as it was saved (RG-DEV-03) —
 * or, when the manager validates, the quote's own salesperson (H28).
 */
async function salesOwner(
  db: Db,
  actor: Actor,
  order: StoredOrder,
): Promise<{ salesUserId: string; letter: string }> {
  const salesUserId = actor.activeRole === 'sales' ? actor.userId : order.salesUserId;
  const user = await db.user.findUnique({
    where: { id: salesUserId },
    select: { ticketLetter: true },
  });
  // RG-USR-07: the admin gives each salesperson a letter; without one there is no ticket.
  if (!user?.ticketLetter) throw new AppError(409, 'TICKET_LETTER_MISSING');
  return { salesUserId, letter: user.ticketLetter };
}

/** A saved discount as the amount it came to: what the caps are checked against again. */
export function asAmount(amount: { toFixed(decimals: number): string }): DiscountEntry | null {
  const value = amount.toFixed(2);
  return value === '0.00' ? null : { kind: 'amount', value };
}

/**
 * The saved lines at the prices in force now and the caps resolved now. A price changed since
 * the quote was saved is refused: the customer agreed on the saved one, the tablet saves the
 * quote again at the new price for the salesperson to check with them (H28). A cap lowered
 * since is checked like on saving (RG-REM-01/02), a discount granted by the owner's code attached
 * against its grant (RG-REM-04).
 */
async function priceAgain(db: Db, order: StoredOrder, customerType: CustomerType) {
  const priced = await priceLines(
    db,
    order.lines.map((line) => ({
      productUnitId: line.productUnitId,
      qty: line.qty.toFixed(),
      discount: asAmount(line.discountAmount),
    })),
    customerType,
  );
  const changed = order.lines.flatMap((line, index) =>
    priced[index]?.unitPrice === line.unitPrice.toFixed(2) ? [] : [line.position],
  );
  if (changed.length > 0) {
    throw new AppError(409, 'ORDER_PRICE_CHANGED', { lines: changed } satisfies OrderPriceChanged);
  }
  // Positions run from 1 on a saved quote: a refusal names them as on saving.
  const totals = totalsWithinCaps(
    priced,
    asAmount(order.orderDiscountAmount),
    grantsOf(usedCode(order)),
  );
  // A quote saved at 0,00 MGA stays a draft: it never becomes an order (H50).
  assertNotFree(totals);
  return { priced, totals };
}

/**
 * A validation already done by this very caller from this very version: the tablet that lost
 * the answer on the shop's Wi-Fi and sends it again gets its ticket, not a refusal.
 */
async function isReplay(
  db: Db,
  actor: Actor,
  order: StoredOrder,
  version: number,
  action: ValidationAction,
) {
  if (order.status === 'DRAFT' || order.version !== version + 1) return false;
  const submitted = await db.auditLog.findFirst({
    where: { entityType: 'order', entityId: order.id, action },
    orderBy: { at: 'desc' },
    select: { userId: true },
  });
  return submitted?.userId === actor.userId;
}

function snapshot(order: Order, reservations: ProductReservation[] = []): AuditSnapshot {
  return {
    number: order.number,
    status: order.status,
    salesUserId: order.salesUser.id,
    ticket: order.ticket ? ticketLabel(order.ticket) : null,
    expiresAt: order.expiresAt,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      unit: line.unitLabel,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discount: line.discountAmount,
    })),
    total: order.total,
    reservations: reservations.map((reservation) => ({
      sku: reservation.sku,
      qty: reservation.qty,
    })),
  };
}

type Priced = Awaited<ReturnType<typeof priceAgain>>;

type ValidationAction = 'order.submitted' | 'order.reactivated';

/** The ticket the order holds already if of the day: validated again that day, it keeps it (H56). */
function ticketOfDay(order: StoredOrder, day: string) {
  const { ticketLetter, ticketSeq, ticketDate } = order;
  if (!ticketLetter || ticketSeq === null || ticketDate?.toISOString().slice(0, 10) !== day) {
    return null;
  }
  return { ticketLetter, ticketSeq };
}

/** The lines frozen as validated: the price row in force and the cap of now (RG-CMD-04). */
async function freezeLines(tx: AuditTx, order: StoredOrder, { priced, totals }: Priced) {
  for (const [index, line] of order.lines.entries()) {
    const price: PricedLine | undefined = priced[index];
    const computed = totals.lines[index];
    if (!price || !computed) continue;
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        productPriceId: price.priceId,
        maxDiscountPct: price.capPct,
        orderDiscountShare: computed.orderDiscountShare,
      },
    });
  }
}

/**
 * Validates a saved quote into an order (RG-CMD-02/03/04, RG-STK-02, RG-TKT-01, RG-FIL-01), all
 * or nothing: prices frozen, stock reserved until the day end, a ticket of the day, the last
 * place in the register queue, and the audit trail of the transition (RG-CMD-06, RG-AUD-01).
 * The cashiers are told in real time once the realtime channel exists (T-018).
 */
export async function submitOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version }: OrderSubmit,
): Promise<Order> {
  const current = await findOrder(db, id);
  if (!current) throw new AppError(404, 'NOT_FOUND');
  if (current.status !== 'DRAFT') {
    if (await isReplay(db, actor, current, version, 'order.submitted')) return toOrder(current);
    throw new AppError(409, 'QUOTE_NOT_DRAFT');
  }
  if (current.version !== version) throw new AppError(409, 'QUOTE_CHANGED');
  return validate(db, actor, current, 'order.submitted');
}

/** The refusals of a reactivation that make the order a quote again, to go over (H56). */
const REOPENING: ReadonlySet<string> = new Set([
  'ORDER_PRICE_CHANGED',
  'STOCK_UNAVAILABLE',
  'QUOTE_DISCOUNT_BEYOND_CAP',
]);

/**
 * An expired order validated again (RG-CMD-08, H31, H56) by its salesperson or the manager:
 * the checks of a validation, the last place in the queue, its ticket kept if of the day. Refused
 * for a price changed, stock short or a cap lowered, it becomes a quote again, same number, for
 * the salesperson to go over with the customer.
 */
export async function reactivateOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version }: OrderSubmit,
): Promise<Order> {
  const current = await findOrder(db, id);
  if (!current) throw new AppError(404, 'NOT_FOUND');
  if (actor.activeRole === 'sales' && current.salesUserId !== actor.userId) {
    throw new AppError(403, 'AUTH_FORBIDDEN');
  }
  if (current.status !== 'EXPIRED') {
    if (await isReplay(db, actor, current, version, 'order.reactivated')) return toOrder(current);
    throw new AppError(409, 'ORDER_NOT_EXPIRED');
  }
  if (current.version !== version) throw new AppError(409, 'ORDER_CHANGED');
  try {
    return await validate(db, actor, current, 'order.reactivated');
  } catch (error) {
    if (error instanceof AppError && REOPENING.has(error.code)) {
      await reopen(db, actor, current, error.code);
    }
    throw error;
  }
}

/** EXPIRED → DRAFT: a quote again, out of the queue — validated, it goes last. */
async function reopen(db: Db, actor: Actor, order: StoredOrder, refusal: string) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: 'EXPIRED', version: order.version },
      data: { status: 'DRAFT', queueRank: null, version: { increment: 1 } },
    });
    if (count === 0) return;
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.reopened',
      entityType: 'order',
      entityId: order.id,
      before: { status: 'EXPIRED' },
      after: { status: 'DRAFT' },
      reason: refusal,
    });
  });
}

/**
 * The validation itself, all or nothing (RG-CMD-02/03/04), of a quote or of an expired order.
 * A quote sent back from the register keeps, validated again that day, its ticket and its place.
 */
async function validate(
  db: Db,
  actor: Actor,
  current: StoredOrder,
  action: ValidationAction,
): Promise<Order> {
  const { id, status: from, version } = current;
  const { salesUserId, letter } = await salesOwner(db, actor, current);
  const customerType = await assertActiveCustomer(db, current.customerId);
  const priced = await priceAgain(db, current, customerType);
  const now = new Date();
  // The day end of its last day: the customer's own duration, else the general one (H45).
  const expiresAt = nextShopTime(
    now,
    await dayEndTime(db),
    await reservationDaysOf(db, current.customerId),
  );
  const ticketDate = shopDateValue(now);
  const day = ticketDate.toISOString().slice(0, 10);
  const kept = ticketOfDay(current, day);
  const changed = from === 'DRAFT' ? 'QUOTE_CHANGED' : 'ORDER_CHANGED';

  return db.$transaction(async (tx) => {
    // The row locked: a save or a validation of it elsewhere waits, then finds it changed.
    const [locked] = await tx.$queryRaw<{ status: string; version: number }[]>`
      SELECT "status"::text AS "status", "version" FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (locked?.status !== from || locked.version !== version) {
      throw new AppError(409, changed);
    }
    const reservations = await reserveStock(
      tx,
      id,
      current.lines.map((line) => ({
        position: line.position,
        productId: line.productId,
        baseQty: line.baseQty.toFixed(2),
        sku: line.sku,
        name: line.name,
        baseUnit: line.product.baseUnit,
      })),
      expiresAt,
    );
    await freezeLines(tx, current, priced);
    await tx.order.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        salesUserId,
        ...(kept ?? {
          ticketLetter: letter,
          ticketSeq: await nextSequenceValue(tx, `TICKET-${day}-${letter}`),
        }),
        ticketDate,
        // Last in the register queue: the order of entry, until the manager reorders (RG-FIL-02);
        // sent back from the register, at its place again that day (H56).
        queueRank:
          (kept && from === 'DRAFT' ? current.queueRank : null) ??
          (await nextSequenceValue(tx, 'QUEUE-REGISTER')),
        submittedAt: now,
        expiresAt,
        version: { increment: 1 },
      },
    });
    const order = await loadOrder(tx, id);
    await recordAudit(tx, {
      ...by(actor),
      action,
      entityType: 'order',
      entityId: id,
      before: snapshot(toOrder(current)),
      after: snapshot(order, reservations),
    });
    return order;
  });
}
