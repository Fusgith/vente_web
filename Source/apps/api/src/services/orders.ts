import {
  computeQuote,
  ticketLabel,
  type DiscountEntry,
  type Order,
  type OrderPriceChanged,
  type OrderSubmit,
  type QuoteBeyondCap,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditSnapshot, type AuditTx } from './audit.js';
import { findOrder, toOrder, type StoredOrder } from './order-view.js';
import { assertActiveCustomer, priceLines, type PricedLine } from './quotes.js';
import { nextSequenceValue } from './sequences.js';
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
function asAmount(amount: { toFixed(decimals: number): string }): DiscountEntry | null {
  const value = amount.toFixed(2);
  return value === '0.00' ? null : { kind: 'amount', value };
}

/**
 * The saved lines at the prices in force now and the caps resolved now. A price changed since
 * the quote was saved is refused: the customer agreed on the saved one, the tablet saves the
 * quote again at the new price for the salesperson to check with them (H28). A cap lowered
 * since is checked like on saving (RG-REM-01/02); no owner's code can widen it yet (T-034).
 */
async function priceAgain(db: Db, order: StoredOrder) {
  const priced = await priceLines(
    db,
    order.lines.map((line) => ({
      productUnitId: line.productUnitId,
      qty: line.qty.toFixed(),
      discount: asAmount(line.discountAmount),
    })),
  );
  const changed = order.lines.flatMap((line, index) =>
    priced[index]?.unitPrice === line.unitPrice.toFixed(2) ? [] : [line.position],
  );
  if (changed.length > 0) {
    throw new AppError(409, 'ORDER_PRICE_CHANGED', { lines: changed } satisfies OrderPriceChanged);
  }
  const totals = computeQuote({
    lines: priced.map((line) => ({
      quantity: line.entry.qty,
      unitPrice: line.unitPrice,
      capPct: line.capPct,
      discount: line.entry.discount,
    })),
    orderDiscount: asAmount(order.orderDiscountAmount),
  });
  if (!totals.withinLimits) {
    throw new AppError(422, 'QUOTE_DISCOUNT_BEYOND_CAP', {
      lines: order.lines.flatMap((line, index) =>
        totals.lines[index]?.withinLimit ? [] : [line.position],
      ),
      order: !totals.orderWithinLimit,
    } satisfies QuoteBeyondCap);
  }
  return { priced, totals };
}

/**
 * A validation already done by this very caller from this very version: the tablet that lost
 * the answer on the shop's Wi-Fi and sends it again gets its ticket, not a refusal.
 */
async function isReplay(db: Db, actor: Actor, order: StoredOrder, version: number) {
  if (order.status === 'DRAFT' || order.version !== version + 1) return false;
  const submitted = await db.auditLog.findFirst({
    where: { entityType: 'order', entityId: order.id, action: 'order.submitted' },
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
    if (await isReplay(db, actor, current, version)) return toOrder(current);
    throw new AppError(409, 'QUOTE_NOT_DRAFT');
  }
  if (current.version !== version) throw new AppError(409, 'QUOTE_CHANGED');
  const { salesUserId, letter } = await salesOwner(db, actor, current);
  await assertActiveCustomer(db, current.customerId);
  const priced = await priceAgain(db, current);
  const now = new Date();
  const expiresAt = nextShopTime(now, await dayEndTime(db));
  const ticketDate = shopDateValue(now);

  return db.$transaction(async (tx) => {
    // The quote row locked: a save or a validation of it elsewhere waits, then finds it changed.
    const [locked] = await tx.$queryRaw<{ status: string; version: number }[]>`
      SELECT "status"::text AS "status", "version" FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (locked?.status !== 'DRAFT' || locked.version !== version) {
      throw new AppError(409, 'QUOTE_CHANGED');
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
    const day = ticketDate.toISOString().slice(0, 10);
    await tx.order.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        salesUserId,
        ticketLetter: letter,
        ticketSeq: await nextSequenceValue(tx, `TICKET-${day}-${letter}`),
        ticketDate,
        // Last in the register queue: the order of entry, until the manager reorders (RG-FIL-02).
        queueRank: await nextSequenceValue(tx, 'QUEUE-REGISTER'),
        submittedAt: now,
        expiresAt,
        version: { increment: 1 },
      },
    });
    const order = await loadOrder(tx, id);
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.submitted',
      entityType: 'order',
      entityId: id,
      before: snapshot(toOrder(current)),
      after: snapshot(order, reservations),
    });
    return order;
  });
}
