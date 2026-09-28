import {
  CASH_METHOD,
  cashVariance,
  sumAmounts,
  type MethodTotal,
  type RegisterSessionClose,
  type SessionSummary,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { shopDayStart } from './shop-time.js';

const SESSION_SELECT = {
  id: true,
  openedAt: true,
  openingFloat: true,
  closedAt: true,
  countedCash: true,
  variance: true,
  note: true,
  station: { select: { id: true, name: true } },
  cashier: { select: { id: true, fullName: true } },
} satisfies Prisma.RegisterSessionSelect;

type StoredSession = Prisma.RegisterSessionGetPayload<{ select: typeof SESSION_SELECT }>;

/** What each payment method took during a session, in the order of the list (RG-PAY-01). */
async function totalsByMethod(db: AuditTx, sessionId: string): Promise<MethodTotal[]> {
  const rows = await db.$queryRaw<{ code: string; label: string; count: bigint; total: string }[]>`
    SELECT "m"."code", "m"."label", COUNT(DISTINCT "p"."id") AS "count",
           SUM("l"."amount")::text AS "total"
      FROM "payments" "p"
      JOIN "payment_lines" "l" ON "l"."payment_id" = "p"."id"
      JOIN "payment_methods" "m" ON "m"."id" = "l"."method_id"
     WHERE "p"."register_session_id" = ${sessionId}::uuid
     GROUP BY "m"."code", "m"."label", "m"."sort_order"
     ORDER BY "m"."sort_order", "m"."label"`;
  return rows.map((row) => ({
    code: row.code,
    label: row.label,
    count: Number(row.count),
    total: sumAmounts([row.total]),
  }));
}

/** What was paid back from this register, by refund method (RG-ANN-02, H36). */
async function refundsByMethod(db: AuditTx, sessionId: string): Promise<MethodTotal[]> {
  const rows = await db.$queryRaw<{ code: string; label: string; count: bigint; total: string }[]>`
    SELECT "m"."code", "m"."label", COUNT(*) AS "count", SUM("c"."amount")::text AS "total"
      FROM "credit_notes" "c"
      JOIN "payment_methods" "m" ON "m"."id" = "c"."refund_method_id"
     WHERE "c"."register_session_id" = ${sessionId}::uuid
     GROUP BY "m"."code", "m"."label", "m"."sort_order"
     ORDER BY "m"."sort_order", "m"."label"`;
  return rows.map((row) => ({
    code: row.code,
    label: row.label,
    count: Number(row.count),
    total: sumAmounts([row.total]),
  }));
}

/**
 * The session with what it took (RG-CAI-03, H35): the drawer should hold the float plus the
 * part paid in cash — the change given back is already out of it — less the cash refunded
 * (H36).
 */
async function summarize(db: AuditTx, session: StoredSession, now: Date): Promise<SessionSummary> {
  const [byMethod, refunds] = await Promise.all([
    totalsByMethod(db, session.id),
    refundsByMethod(db, session.id),
  ]);
  const cashOf = (totals: MethodTotal[]) =>
    totals.find((method) => method.code === CASH_METHOD)?.total ?? '0.00';
  const cashOut = cashVariance('0', cashOf(refunds));
  return {
    id: session.id,
    station: session.station,
    cashier: session.cashier,
    openedAt: session.openedAt.toISOString(),
    openingFloat: session.openingFloat.toFixed(2),
    closedAt: session.closedAt?.toISOString() ?? null,
    byMethod,
    refunds,
    cashExpected: sumAmounts([session.openingFloat.toFixed(2), cashOf(byMethod), cashOut]),
    countedCash: session.countedCash?.toFixed(2) ?? null,
    variance: session.variance?.toFixed(2) ?? null,
    note: session.note,
    forgotten: session.closedAt === null && session.openedAt < shopDayStart(now),
  };
}

/** The caller's open session with its takings so far, or null (RG-CAI-02). */
export async function currentSummary(db: Db, userId: string): Promise<SessionSummary | null> {
  const session = await db.registerSession.findFirst({
    where: { cashierId: userId, closedAt: null },
    select: SESSION_SELECT,
  });
  return session ? summarize(db, session, new Date()) : null;
}

/**
 * Closes the caller's own session (RG-CAI-03, H35): nobody left at the register, the cash
 * counted against the float plus the cash taken, any variance explained. Final and audited;
 * the takings are frozen in `expected_by_method`.
 */
export async function closeSession(
  db: Db,
  actor: Actor,
  { countedCash, note }: RegisterSessionClose,
): Promise<SessionSummary> {
  return db.$transaction(async (tx) => {
    const [open] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "register_sessions"
       WHERE "cashier_id" = ${actor.userId}::uuid AND "closed_at" IS NULL FOR UPDATE`;
    if (!open) throw new AppError(409, 'REGISTER_SESSION_REQUIRED');
    const busy = await tx.order.findFirst({
      where: { status: 'AT_REGISTER', cashierUserId: actor.userId },
      select: { id: true },
    });
    if (busy) throw new AppError(409, 'REGISTER_BUSY');

    const now = new Date();
    const session = await tx.registerSession.findUniqueOrThrow({
      where: { id: open.id },
      select: SESSION_SELECT,
    });
    const before = await summarize(tx, session, now);
    const variance = cashVariance(countedCash, before.cashExpected);
    if (variance !== '0.00' && !note) throw new AppError(422, 'REGISTER_SESSION_NOTE_REQUIRED');
    const closed = await tx.registerSession.update({
      where: { id: open.id },
      data: {
        closedAt: now,
        countedCash,
        variance,
        note,
        expectedByMethod: {
          byMethod: before.byMethod,
          refunds: before.refunds,
          cashExpected: before.cashExpected,
        },
      },
      select: SESSION_SELECT,
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'register_session.closed',
      entityType: 'register_session',
      entityId: open.id,
      before: { closedAt: null },
      after: {
        closedAt: now.toISOString(),
        cashExpected: before.cashExpected,
        countedCash: closed.countedCash?.toFixed(2) ?? null,
        variance,
      },
      reason: note,
    });
    return summarize(tx, closed, now);
  });
}

/**
 * The sessions of a shop day — opened that day — and any still open from an earlier one, flagged
 * forgotten (RG-CAI-04/05): what the manager and the owner read.
 */
export async function sessionsOfDay(db: Db, day: Date): Promise<SessionSummary[]> {
  const start = shopDayStart(day);
  const end = shopDayStart(day, 1);
  const sessions = await db.registerSession.findMany({
    where: {
      OR: [{ openedAt: { gte: start, lt: end } }, { closedAt: null, openedAt: { lt: start } }],
    },
    orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    select: SESSION_SELECT,
  });
  const now = new Date();
  return Promise.all(sessions.map((session) => summarize(db, session, now)));
}

/** One session, for its report: its cashier, the manager or the owner (annexe B). */
export async function sessionFor(db: Db, actor: Actor, id: string) {
  const session = await db.registerSession.findUnique({ where: { id }, select: SESSION_SELECT });
  if (!session) throw new AppError(404, 'NOT_FOUND');
  const reader = actor.activeRole === 'manager' || actor.activeRole === 'owner';
  if (!reader && session.cashier.id !== actor.userId) throw new AppError(403, 'AUTH_FORBIDDEN');
  const invoices = await db.invoice.findMany({
    where: { payment: { registerSessionId: id } },
    orderBy: [{ year: 'asc' }, { seq: 'asc' }],
    select: { number: true, payment: { select: { totalDue: true } } },
  });
  return {
    summary: await summarize(db, session, new Date()),
    invoices: invoices.map((invoice) => ({
      number: invoice.number,
      total: invoice.payment?.totalDue.toFixed(2) ?? '0.00',
    })),
  };
}
