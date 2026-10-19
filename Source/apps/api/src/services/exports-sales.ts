import {
  EXPORT_VALUES as words,
  formatMga,
  formatQty,
  NBSP,
  sumAmounts,
  ticketLabel,
  type MethodTotal,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Rows } from './export-book.js';
import { sessionsOpened } from './register-closing.js';

/** The instants of the shop's days of the period. */
export interface Span {
  gte: Date;
  lt: Date;
}

const name = (user: { fullName: string } | null) => user?.fullName ?? '';
const minutes = (from: Date | null, to: Date | null | undefined) =>
  from && to ? Math.round((to.getTime() - from.getTime()) / 60_000) : null;

/** Invoices then their lines, unit of sale and quantity in base unit (RG-EXP-01). */
export async function salesRows(db: Db, issuedAt: Span): Promise<Rows[]> {
  const invoices = await db.invoice.findMany({
    where: { issuedAt },
    orderBy: [{ year: 'asc' }, { seq: 'asc' }],
    select: {
      number: true,
      issuedAt: true,
      status: true,
      payment: { select: { cashier: { select: { fullName: true } } } },
      order: {
        select: {
          number: true,
          subtotal: true,
          discountTotal: true,
          total: true,
          customer: { select: { name: true, phone: true } },
          salesUser: { select: { fullName: true } },
          lines: {
            orderBy: { position: 'asc' },
            select: {
              sku: true,
              name: true,
              unitLabel: true,
              qty: true,
              factor: true,
              baseQty: true,
              unitPrice: true,
              discountAmount: true,
              lineTotal: true,
              orderDiscountShare: true,
              product: { select: { baseUnit: true } },
            },
          },
        },
      },
    },
  });
  const heads = invoices.map(({ number, issuedAt: at, status, payment, order }) => [
    number,
    at,
    words.invoiceStatus[status] ?? status,
    order.number,
    order.customer.name,
    order.customer.phone,
    name(order.salesUser),
    name(payment?.cashier ?? null),
    order.subtotal.toFixed(2),
    order.discountTotal.toFixed(2),
    order.total.toFixed(2),
  ]);
  const lines = invoices.flatMap(({ number, issuedAt: at, order }) =>
    order.lines.map((line) => [
      number,
      at,
      line.sku,
      line.name,
      line.unitLabel,
      line.qty.toFixed(2),
      line.factor.toFixed(3),
      line.baseQty.toFixed(2),
      line.product.baseUnit,
      line.unitPrice.toFixed(2),
      line.discountAmount.toFixed(2),
      line.lineTotal.toFixed(2),
      line.orderDiscountShare.toFixed(2),
      line.lineTotal.minus(line.orderDiscountShare).toFixed(2),
    ]),
  );
  return [heads, lines];
}

/** Each payment line, then the totals by method (RG-EXP-01, RG-PAY-01). */
export async function paymentRows(db: Db, createdAt: Span): Promise<Rows[]> {
  const lines = await db.paymentLine.findMany({
    where: { payment: { createdAt } },
    orderBy: [{ payment: { createdAt: 'asc' } }, { id: 'asc' }],
    select: {
      paymentId: true,
      amount: true,
      reference: true,
      method: { select: { label: true } },
      payment: {
        select: {
          createdAt: true,
          invoice: { select: { number: true } },
          cashier: { select: { fullName: true } },
          registerSession: { select: { station: { select: { name: true } } } },
        },
      },
    },
  });
  const byMethod = new Map<string, { payments: Set<string>; amounts: string[] }>();
  for (const line of lines) {
    const entry = byMethod.get(line.method.label) ?? { payments: new Set(), amounts: [] };
    entry.payments.add(line.paymentId);
    entry.amounts.push(line.amount.toFixed(2));
    byMethod.set(line.method.label, entry);
  }
  return [
    lines.map(({ amount, reference, method, payment }) => [
      payment.createdAt,
      payment.invoice?.number ?? '',
      payment.registerSession.station.name,
      name(payment.cashier),
      method.label,
      amount.toFixed(2),
      reference,
    ]),
    [...byMethod].map(([label, { payments, amounts }]) => [
      label,
      payments.size,
      sumAmounts(amounts),
    ]),
  ];
}

/** Every discount of the invoiced sales, on a line or on the total, with its origin (RG-EXP-01). */
export async function discountRows(db: Db, issuedAt: Span): Promise<Rows[]> {
  const invoices = await db.invoice.findMany({
    where: { issuedAt },
    orderBy: [{ year: 'asc' }, { seq: 'asc' }],
    select: {
      number: true,
      issuedAt: true,
      order: {
        select: {
          orderDiscountPct: true,
          orderDiscountAmount: true,
          orderDiscountSource: true,
          customer: { select: { name: true } },
          salesUser: { select: { fullName: true } },
          lines: {
            where: { discountAmount: { gt: 0 } },
            orderBy: { position: 'asc' },
            select: {
              sku: true,
              name: true,
              discountPct: true,
              discountAmount: true,
              discountSource: true,
            },
          },
        },
      },
    },
  });
  return [
    invoices.flatMap(({ number, issuedAt: at, order }) => {
      const sale = [at, number, order.customer.name, name(order.salesUser)];
      const rows: Rows = order.lines.map((line) => [
        ...sale,
        words.discountOn.line,
        line.sku,
        line.name,
        line.discountPct.isZero() ? null : line.discountPct.toFixed(2),
        line.discountAmount.toFixed(2),
        words.discountSource[line.discountSource] ?? line.discountSource,
      ]);
      if (order.orderDiscountAmount.greaterThan(0)) {
        rows.push([
          ...sale,
          words.discountOn.order,
          '',
          words.allProducts,
          order.orderDiscountPct?.toFixed(2) ?? null,
          order.orderDiscountAmount.toFixed(2),
          words.discountSource[order.orderDiscountSource] ?? order.orderDiscountSource,
        ]);
      }
      return rows;
    }),
  ];
}

/** The codes issued over the period, what each grants and what became of it (RG-EXP-01). */
export async function discountCodeRows(db: Db, issuedAt: Span): Promise<Rows[]> {
  const now = new Date();
  const codes = await db.discountCode.findMany({
    where: { issuedAt },
    orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
    select: {
      code: true,
      issuedAt: true,
      expiresAt: true,
      status: true,
      usedAt: true,
      revokedAt: true,
      issuedBy: { select: { fullName: true } },
      customer: { select: { name: true } },
      order: { select: { number: true } },
      usedOnOrder: { select: { number: true } },
      items: {
        select: { pct: true, amount: true, product: { select: { sku: true, name: true } } },
      },
    },
  });
  return [
    codes.map((code) => {
      const status = code.status === 'ACTIVE' && code.expiresAt <= now ? 'EXPIRED' : code.status;
      const grants = code.items.map(({ pct, amount, product }) => {
        const what = product ? `${product.sku} ${product.name}` : words.allProducts;
        const how = pct
          ? `${formatQty(pct.toFixed(2))}${NBSP}%`
          : formatMga(amount?.toFixed(2) ?? '0');
        return `${what} : ${how}`;
      });
      return [
        code.issuedAt,
        code.code,
        name(code.issuedBy),
        code.customer?.name ?? '',
        code.order?.number ?? '',
        grants.join(' ; '),
        code.expiresAt,
        words.codeStatus[status] ?? status,
        code.usedAt,
        code.usedOnOrder?.number ?? '',
        code.revokedAt,
      ];
    }),
  ];
}

const total = (totals: readonly MethodTotal[]) => sumAmounts(totals.map((method) => method.total));

/** The sessions opened over the period, then each one's takings by method (RG-CAI-03, H35). */
export async function closingRows(db: Db, openedAt: Span, cashierId?: string): Promise<Rows[]> {
  const sessions = await sessionsOpened(db, openedAt, cashierId);
  return [
    sessions.map((session) => [
      session.station.name,
      session.cashier.fullName,
      new Date(session.openedAt),
      session.closedAt ? new Date(session.closedAt) : null,
      session.openingFloat,
      total(session.byMethod),
      total(session.refunds),
      session.cashExpected,
      session.countedCash,
      session.variance,
      session.note,
    ]),
    sessions.flatMap((session) => {
      const codes = [...new Set([...session.byMethod, ...session.refunds].map((m) => m.code))];
      return codes.map((code) => {
        const taken = session.byMethod.find((method) => method.code === code);
        const refunded = session.refunds.find((method) => method.code === code);
        return [
          session.station.name,
          session.cashier.fullName,
          new Date(session.openedAt),
          taken?.label ?? refunded?.label ?? code,
          taken?.count ?? 0,
          taken?.total ?? '0.00',
          refunded?.count ?? 0,
          refunded?.total ?? '0.00',
        ];
      });
    }),
  ];
}

/**
 * The orders validated over the period with their queue times (RG-EXP-01): at the register from
 * validation to the call, at delivery from payment to the first counter taking it (as RG-DSP-04).
 */
export async function queueRows(db: Db, submittedAt: Span): Promise<Rows[]> {
  const orders = await db.order.findMany({
    where: { submittedAt },
    orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    select: {
      number: true,
      status: true,
      ticketLetter: true,
      ticketSeq: true,
      submittedAt: true,
      calledAt: true,
      paidAt: true,
      readyAt: true,
      deliveredAt: true,
      noShowCount: true,
      customer: { select: { name: true } },
      salesUser: { select: { fullName: true } },
      deliveries: { orderBy: { startedAt: 'asc' }, take: 1, select: { startedAt: true } },
    },
  });
  return [
    orders.map((order) => [
      order.ticketLetter && order.ticketSeq !== null
        ? ticketLabel({ letter: order.ticketLetter, seq: order.ticketSeq })
        : '',
      order.number,
      order.customer.name,
      name(order.salesUser),
      order.submittedAt,
      order.calledAt,
      order.paidAt,
      order.readyAt,
      order.deliveredAt,
      minutes(order.submittedAt, order.calledAt),
      minutes(order.paidAt, order.deliveries[0]?.startedAt),
      order.noShowCount,
      words.orderStatus[order.status] ?? order.status,
    ]),
  ];
}
