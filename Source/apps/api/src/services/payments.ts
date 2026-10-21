import {
  CASH_METHOD,
  CREDIT_METHOD,
  isTermMethod,
  settle,
  sumAmounts,
  type PaidOrder,
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
import { creditDueOn } from './credit-conditions.js';
import { grantedDueOn } from './credit-requests.js';
import { issueInvoice, readInvoiceSettings } from './invoices.js';
import { loadOrder } from './orders.js';
import { lockOpenSession } from './register-sessions.js';
import { nextSequenceValue } from './sequences.js';
import { shopDate, shopDateValue } from './shop-time.js';

/** The methods offered at the register, in their order (RG-PAY-01). */
export async function paymentMethods(db: Db): Promise<PaymentMethod[]> {
  return db.paymentMethod.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    select: { id: true, code: true, label: true, requiresReference: true },
  });
}

export const PAYMENT_INCLUDE = {
  invoice: { select: { id: true, number: true } },
  lines: {
    orderBy: { id: 'asc' },
    include: { method: { select: { code: true, label: true } } },
  },
} satisfies Prisma.PaymentInclude;

type StoredPayment = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

/** A payment as the screens read it. */
export function toPaymentView(payment: StoredPayment): Payment {
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
 * Records the payment of the order at the caller's register (RG-PAY-01 à 07, H32), all or
 * nothing: lines adding up exactly to the amount due, the change on the cash part, the caller's
 * open register session; the order paid, its reservation firm until delivery (RG-STK-03), last
 * in the delivery queue (RG-LIV-01), audited before → after. The same `key` sent again — a
 * screen that lost the answer — gets the same payment back, never a second one. Immutable once
 * recorded (RG-PAY-06). Its invoice is issued in the same transaction, numbered without a gap
 * (RG-FAC-01, H33); the PDF is written once committed.
 */
export async function payOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version, lines, cashReceived }: PaymentInput,
  key: string,
): Promise<PaidOrder> {
  const settings = await readInvoiceSettings(db);
  return db.$transaction(async (tx) => {
    // The order row locked: a second tap, or the same key sent again, waits for this one.
    const [order] = await tx.$queryRaw<
      {
        status: string;
        version: number;
        cashier_user_id: string | null;
        total: string;
        priority: number;
        customer_id: string;
      }[]
    >`
      SELECT "status"::text AS "status", "version", "cashier_user_id", "total"::text AS "total",
             "priority", "customer_id"
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
      if (!replayed.invoice) throw new AppError(409, 'ORDER_CHANGED');
      return {
        order: await loadOrder(tx, id),
        payment: toPaymentView(replayed),
        invoice: replayed.invoice,
      };
    }

    const mine = actor.activeRole === 'manager' || order.cashier_user_id === actor.userId;
    if (order.status !== 'AT_REGISTER' || !mine) throw new AppError(409, 'ORDER_NOT_AT_REGISTER');
    if (order.version !== version) throw new AppError(409, 'ORDER_CHANGED');
    // Not paid while the owner may still answer (H52); a request takes the same lock. Past its
    // day end, not yet swept, it holds the order no more: paid within the caps (H54).
    const pending = await tx.discountRequest.count({
      where: { orderId: id, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pending > 0) throw new AppError(409, 'DISCOUNT_REQUEST_PENDING');
    const session = await lockOpenSession(tx, actor.userId);
    if (!session) throw new AppError(409, 'REGISTER_SESSION_REQUIRED');

    const checked = await checkedLines(tx, lines);
    const settled = settle(
      order.total,
      checked.map((line) => ({ amount: line.amount, cash: line.method.code === CASH_METHOD })),
      cashReceived,
      settings.cashRounding,
    );
    if (settled.issue) throw new AppError(422, ISSUE_CODE[settled.issue]);

    const now = new Date();
    // The part left to pay later (RG-PAY-02), one per sale: on credit, or on a title due on its
    // day (H68); either within the customer's credit conditions (H67).
    const term = checked.filter((line) => isTermMethod(line.method.code));
    if (term.length > 1) throw new AppError(422, 'PAYMENT_TERM_SINGLE');
    const later = term[0];
    const titled = later && later.method.code !== CREDIT_METHOD ? later : null;
    const today = shopDateValue(now).toISOString().slice(0, 10);
    if (titled && (!titled.reference || !titled.bank || !titled.dueOn || titled.dueOn < today)) {
      throw new AppError(422, 'PAYMENT_INSTRUMENT_DETAILS');
    }
    // A credit the owner granted on this order stands in for the conditions (⚠️ H76).
    const creditDue = later
      ? ((await grantedDueOn(tx, id, later.amount, now)) ??
        (await creditDueOn(tx, order.customer_id, later.amount, now)))
      : null;
    const dueOn = titled?.dueOn ? new Date(titled.dueOn) : creditDue;
    const credit =
      later && dueOn
        ? {
            amount: sumAmounts([later.amount]),
            dueOn: shopDate(dueOn),
            instrument: titled
              ? { method: titled.method.label, number: titled.reference!, bank: titled.bank! }
              : null,
          }
        : null;
    const cashier = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { fullName: true },
    });
    // Numbered last, once every check passed: a refused payment never takes a number.
    const invoice = await issueInvoice(tx, {
      order: await loadOrder(tx, id),
      cashier: cashier.fullName,
      payment: {
        lines: checked.map((line) => ({
          method: line.method.label,
          reference: line.reference,
          amount: sumAmounts([line.amount]),
        })),
        cashReceived: settled.cashReceived,
        change: settled.change,
      },
      cashRounding: settled.rounding,
      credit,
      settings,
      at: now,
    });
    if (later && dueOn) {
      await tx.receivable.create({
        data: {
          invoiceId: invoice.id,
          customerId: order.customer_id,
          amount: later.amount,
          dueOn,
          ...(titled && {
            instrumentMethodId: titled.method.id,
            instrumentNumber: titled.reference,
            instrumentBank: titled.bank ?? null,
            instrumentStatus: 'HANDED' as const,
          }),
        },
      });
    }
    const payment = await tx.payment.create({
      data: {
        orderId: id,
        invoiceId: invoice.id,
        registerSessionId: session.id,
        cashierId: actor.userId,
        // What the lines settle: the cash rounding included (RG-FMT-04, H70).
        totalDue: settled.due,
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
    await tx.order.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: now,
        expiresAt: null,
        registerStationId: session.stationId,
        // Last in the delivery queue: the order of payment (RG-LIV-01, RG-FIL-06). A priority
        // given at the register stays there: it never jumps the delivery queue later.
        queueRank: await nextSequenceValue(tx, 'QUEUE-DELIVERY'),
        priority: 0,
        version: { increment: 1 },
      },
    });
    // Paid, the reservation is firm until delivery (RG-STK-03).
    await tx.reservation.updateMany({
      where: { orderId: id, status: 'ACTIVE' },
      data: { expiresAt: null },
    });
    const result = toPaymentView(payment);
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.paid',
      entityType: 'order',
      entityId: id,
      before: { status: 'AT_REGISTER', total: order.total, priority: order.priority > 0 },
      after: {
        status: 'PAID',
        invoice: invoice.number,
        registerSessionId: session.id,
        lines: result.lines.map((line) => ({
          method: line.method.code,
          amount: line.amount,
          reference: line.reference,
        })),
        cashReceived: result.cashReceived,
        change: result.changeGiven,
        cashRounding: settled.rounding,
        priority: false,
        credit,
      },
    });
    return { order: await loadOrder(tx, id), payment: result, invoice };
  });
}
