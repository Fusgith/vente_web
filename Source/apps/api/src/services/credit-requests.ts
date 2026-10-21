import type {
  CreditRefusal,
  CreditRequest,
  CreditRequestCreate,
  CreditRequestList,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma, type OrderStatus } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';
import { creditDueOn } from './credit-conditions.js';
import { lockOrder } from './discount-requests.js';
import { shopDateValue, shopDayStart } from './shop-time.js';

const person = { select: { id: true, fullName: true } };
const select = {
  id: true,
  status: true,
  amount: true,
  refusal: true,
  outstanding: true,
  days: true,
  createdAt: true,
  decidedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  order: { select: { id: true, number: true, total: true } },
  requestedBy: person,
  decidedBy: person,
} satisfies Prisma.CreditRequestSelect;
type Stored = Prisma.CreditRequestGetPayload<{ select: typeof select }>;

function toView(row: Stored): CreditRequest {
  return {
    ...row,
    amount: row.amount.toFixed(2),
    refusal: row.refusal as CreditRefusal,
    outstanding: row.outstanding.toFixed(2),
    order: { ...row.order, total: row.order.total.toFixed(2) },
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

/** The owner answers while the order waits at a register or set aside (H52), not once it is gone. */
const ANSWERABLE: OrderStatus[] = ['AT_REGISTER', 'SUBMITTED'];

/** Why the conditions refuse this credit (H72); within them, the register needs no one. */
async function refusalOf(
  tx: Prisma.TransactionClient,
  customerId: string,
  amount: string,
  now: Date,
): Promise<CreditRefusal> {
  try {
    await creditDueOn(tx, customerId, amount, now);
  } catch (error) {
    if (error instanceof AppError && error.code === 'CREDIT_NOT_ALLOWED') {
      return (error.details as { reason: CreditRefusal }).reason;
    }
    throw error;
  }
  throw new AppError(409, 'CREDIT_ALLOWED');
}

/**
 * The register asks the owner for credit the conditions refuse (H67, ⚠️ H76): on the order at
 * its register, one request at a time, with why and what the customer already owes.
 */
export async function createCreditRequest(
  db: Db,
  actor: Actor,
  input: CreditRequestCreate,
  now = new Date(),
): Promise<CreditRequest> {
  return db.$transaction(async (tx) => {
    await lockOrder(tx, input.orderId);
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { status: true, cashierUserId: true, customerId: true },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND');
    const mine = actor.activeRole === 'manager' || order.cashierUserId === actor.userId;
    if (order.status !== 'AT_REGISTER' || !mine) throw new AppError(409, 'ORDER_NOT_AT_REGISTER');
    if (await tx.creditRequest.count({ where: { orderId: input.orderId, status: 'PENDING' } })) {
      throw new AppError(409, 'CREDIT_REQUEST_PENDING');
    }
    const refusal = await refusalOf(tx, order.customerId, input.amount, now);
    const { _sum } = await tx.receivable.aggregate({
      where: { customerId: order.customerId, status: 'OPEN' },
      _sum: { amount: true, paid: true },
    });
    const { id } = await tx.creditRequest.create({
      data: {
        orderId: input.orderId,
        customerId: order.customerId,
        amount: input.amount,
        refusal,
        outstanding: (_sum.amount ?? new Prisma.Decimal(0)).minus(_sum.paid ?? 0),
        requestedById: actor.userId,
        createdAt: now,
      },
      select: { id: true },
    });
    const request = toView(await tx.creditRequest.findUniqueOrThrow({ where: { id }, select }));
    await recordAudit(tx, {
      ...by(actor),
      action: 'credit_request.created',
      entityType: 'credit_request',
      entityId: id,
      after: {
        orderId: input.orderId,
        customerId: order.customerId,
        amount: request.amount,
        refusal,
        outstanding: request.outstanding,
      },
    });
    return request;
  });
}

/** The owner grants the credit with its days to settle (`days`), or refuses it (null) (⚠️ H76). */
export async function decideCreditRequest(
  db: Db,
  actor: Actor,
  id: string,
  days: number | null,
  now = new Date(),
): Promise<CreditRequest> {
  const status = days === null ? 'REJECTED' : 'GRANTED';
  return db.$transaction(async (tx) => {
    const { count } = await tx.creditRequest.updateMany({
      where: { id, status: 'PENDING', order: { status: { in: ANSWERABLE } } },
      data: { status, days, decidedById: actor.userId, decidedAt: now },
    });
    if (count === 0) {
      throw (await tx.creditRequest.count({ where: { id } }))
        ? new AppError(409, 'CREDIT_REQUEST_NOT_PENDING')
        : new AppError(404, 'NOT_FOUND');
    }
    const request = toView(await tx.creditRequest.findUniqueOrThrow({ where: { id }, select }));
    await recordAudit(tx, {
      ...by(actor),
      action: status === 'GRANTED' ? 'credit_request.granted' : 'credit_request.rejected',
      entityType: 'credit_request',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status, orderId: request.order.id, amount: request.amount, days },
    });
    return request;
  });
}

/** The owner's list (RG-DSH-05): those waiting, oldest first, then today's answers. */
export async function listCreditRequests(db: Db, now = new Date()): Promise<CreditRequestList> {
  const [pending, recent] = await Promise.all([
    db.creditRequest.findMany({
      where: { status: 'PENDING', order: { status: { in: ANSWERABLE } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select,
    }),
    db.creditRequest.findMany({
      where: { decidedAt: { gte: shopDayStart(now) } },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select,
    }),
  ]);
  return { pending: pending.map(toView), recent: recent.map(toView) };
}

/**
 * The due day of a credit the owner granted on this order for at least `amount` (⚠️ H76): the
 * payment then needs no credit condition. Null when none was.
 */
export async function grantedDueOn(
  tx: AuditTx,
  orderId: string,
  amount: string,
  now: Date,
): Promise<Date | null> {
  const granted = await tx.creditRequest.findFirst({
    where: { orderId, status: 'GRANTED', amount: { gte: amount } },
    orderBy: { decidedAt: 'desc' },
    select: { days: true },
  });
  if (!granted?.days) return null;
  return new Date(shopDateValue(now).getTime() + granted.days * 86_400_000);
}
