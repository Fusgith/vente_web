import {
  CASH_METHOD,
  settle,
  type Order,
  type Payment,
  type PaymentInput,
  type PaymentMethod,
  type SettleIssue,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { loadOrder } from './orders.js';
import { nextSequenceValue } from './sequences.js';

/** The methods offered at the register, in their order (RG-PAY-01). */
export async function paymentMethods(db: Db): Promise<PaymentMethod[]> {
  return db.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    select: { id: true, code: true, label: true, requiresReference: true },
  });
}

const PAYMENT_INCLUDE = {
  lines: {
    orderBy: { id: 'asc' },
    include: { method: { select: { code: true, label: true } } },
  },
} satisfies Prisma.PaymentInclude;

type StoredPayment = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

function toPayment(payment: StoredPayment): Payment {
  return {
    id: payment.id,
    orderId: payment.orderId,
    totalDue: payment.totalDue.toFixed(2),
    cashReceived: payment.cashReceived.toFixed(2),
    changeGiven: payment.changeGiven.toFixed(2),
    createdAt: payment.createdAt.toISOString(),
    lines: payment.lines.map((line) => ({
      method: line.method,
      amount: line.amount.toFixed(2),
      reference: line.reference,
    })),
  };
}

const ISSUE_CODE = {
  CASH_TWICE: 'PAYMENT_CASH_TWICE',
  TOTAL_MISMATCH: 'PAYMENT_TOTAL_MISMATCH',
  CASH_SHORT: 'PAYMENT_CASH_SHORT',
  CASH_WITHOUT_LINE: 'PAYMENT_CASH_WITHOUT_LINE',
} as const satisfies Record<SettleIssue, string>;

export interface PaidOrder {
  order: Order;
  payment: Payment;
}

/** The lines with their method, each active and carrying the reference it requires (RG-PAY-04). */
async function checkedLines(tx: Prisma.TransactionClient, lines: PaymentInput['lines']) {
  const methods = await tx.paymentMethod.findMany({
    where: { id: { in: lines.map((line) => line.methodId) }, isActive: true },
  });
  return lines.map((line) => {
    const method = methods.find((candidate) => candidate.id === line.methodId);
    if (!method) throw new AppError(409, 'PAYMENT_METHOD_INVALID');
    if (method.requiresReference && !line.reference) {
      throw new AppError(422, 'PAYMENT_REFERENCE_REQUIRED');
    }
    return { ...line, method };
  });
}

/**
 * Records the payment of the order at the caller's register (RG-PAY-01 à 07, ⚠️ H32), all or
 * nothing: lines adding up exactly to the amount due, the change on the cash part, the caller's
 * open register session; the order paid, its reservation firm until delivery (RG-STK-03), last
 * in the delivery queue (RG-LIV-01), audited before → after. The same `key` sent again — a
 * screen that lost the answer — gets the same payment back, never a second one. Immutable once
 * recorded (RG-PAY-06). The numbered invoice comes with T-052.
 */
export async function payOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version, lines, cashReceived }: PaymentInput,
  key: string,
): Promise<PaidOrder> {
  return db.$transaction(async (tx) => {
    // The order row locked: a second tap, or the same key sent again, waits for this one.
    const [order] = await tx.$queryRaw<
      { status: string; version: number; cashier_user_id: string | null; total: string }[]
    >`
      SELECT "status"::text AS "status", "version", "cashier_user_id", "total"::text AS "total"
        FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!order) throw new AppError(404, 'NOT_FOUND');

    const replayed = await tx.payment.findUnique({
      where: { idempotencyKey: key },
      include: PAYMENT_INCLUDE,
    });
    if (replayed) {
      if (replayed.orderId !== id || replayed.cashierId !== actor.userId) {
        throw new AppError(400, 'BAD_REQUEST');
      }
      return { order: await loadOrder(tx, id), payment: toPayment(replayed) };
    }

    const mine = actor.activeRole === 'manager' || order.cashier_user_id === actor.userId;
    if (order.status !== 'AT_REGISTER' || !mine) throw new AppError(409, 'ORDER_NOT_AT_REGISTER');
    if (order.version !== version) throw new AppError(409, 'ORDER_CHANGED');
    const session = await tx.registerSession.findFirst({
      where: { cashierId: actor.userId, closedAt: null },
      select: { id: true, stationId: true },
    });
    if (!session) throw new AppError(409, 'REGISTER_SESSION_REQUIRED');

    const checked = await checkedLines(tx, lines);
    const settled = settle(
      order.total,
      checked.map((line) => ({ amount: line.amount, cash: line.method.code === CASH_METHOD })),
      cashReceived,
    );
    if (settled.issue) throw new AppError(422, ISSUE_CODE[settled.issue]);

    const payment = await tx.payment.create({
      data: {
        orderId: id,
        registerSessionId: session.id,
        cashierId: actor.userId,
        totalDue: order.total,
        cashReceived: settled.cashReceived,
        changeGiven: settled.change,
        idempotencyKey: key,
        lines: {
          create: checked.map((line) => ({
            methodId: line.method.id,
            amount: line.amount,
            reference: line.reference,
          })),
        },
      },
      include: PAYMENT_INCLUDE,
    });
    const now = new Date();
    await tx.order.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: now,
        expiresAt: null,
        registerStationId: session.stationId,
        // Last in the delivery queue: the order of payment (RG-LIV-01, RG-FIL-06).
        queueRank: await nextSequenceValue(tx, 'QUEUE-DELIVERY'),
        version: { increment: 1 },
      },
    });
    // Paid, the reservation is firm until delivery (RG-STK-03).
    await tx.reservation.updateMany({
      where: { orderId: id, status: 'ACTIVE' },
      data: { expiresAt: null },
    });
    const result = toPayment(payment);
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.paid',
      entityType: 'order',
      entityId: id,
      before: { status: 'AT_REGISTER', total: order.total },
      after: {
        status: 'PAID',
        registerSessionId: session.id,
        lines: result.lines.map((line) => ({
          method: line.method.code,
          amount: line.amount,
          reference: line.reference,
        })),
        cashReceived: result.cashReceived,
        change: result.changeGiven,
      },
    });
    return { order: await loadOrder(tx, id), payment: result };
  });
}
