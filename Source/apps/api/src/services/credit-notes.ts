import {
  CREDIT_METHOD,
  formatTime,
  invoiceNumber,
  issueCauseSchema,
  quoteLineSchema,
  type CreditNoteRef,
  type InvoiceLookup,
  type OrderRefund,
  type RefundedOrder,
} from '@vente-web/shared';
import { z } from 'zod';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { renderPdf } from '../pdf/render.js';
import { creditNoteDocument } from '../pdf/templates/credit-note.js';
import { by, type Actor } from './actor.js';
import { managerApproval } from './approval.js';
import { recordAudit } from './audit.js';
import { partialDelivery } from './delivery-issues.js';
import { storedPdf } from './document-files.js';
import { invoiceSnapshotSchema } from './invoices.js';
import { loadOrder } from './orders.js';
import { PAYMENT_INCLUDE, toPaymentView } from './payments.js';
import { lockOpenSession } from './register-sessions.js';
import { nextSequenceValue } from './sequences.js';
import { readSetting } from './settings.js';
import { shopDate, shopYear } from './shop-time.js';
import { readStoreLegal } from './store-legal.js';
import { releaseReservations } from './stock-reservation.js';

/** Everything a credit note prints, frozen when issued (RG-FAC-05, H36). */
export const creditNoteSnapshotSchema = z.object({
  number: z.string(),
  issuedOn: z.string(),
  issuedAt: z.string(),
  legal: invoiceSnapshotSchema.shape.legal,
  invoice: z.object({ number: z.string(), issuedOn: z.string() }),
  order: z.object({ number: z.string(), ticket: z.string() }),
  customer: z.object({ name: z.string(), phone: z.string() }),
  lines: z.array(quoteLineSchema),
  totals: invoiceSnapshotSchema.shape.totals,
  amount: z.string(),
  reason: z.string(),
  refund: z.object({ method: z.string(), reference: z.string().nullable(), amount: z.string() }),
  cashier: z.string(),
  approvedBy: z.string(),
  /** A partial credit note's lines (H37): what was not handed over, why, and its credit. */
  credited: z
    .array(
      z.object({
        name: z.string(),
        unitLabel: z.string(),
        qty: z.string(),
        cause: issueCauseSchema,
        amount: z.string(),
      }),
    )
    .optional(),
});
export type CreditNoteSnapshot = z.infer<typeof creditNoteSnapshotSchema>;

const PREFIX = /^[A-Z0-9]{1,6}$/;

const LOOKUP_INCLUDE = {
  payment: { include: PAYMENT_INCLUDE },
  creditNotes: { select: { id: true, number: true }, orderBy: { seq: 'asc' } },
} satisfies Prisma.InvoiceInclude;

/**
 * A sale found by its invoice number, as the customer shows it (H36): trimmed, any case.
 * The order, how it was paid, to cancel it, and the credit notes already issued on it.
 */
export async function lookupInvoice(db: Db, number: string): Promise<InvoiceLookup> {
  const invoice = await db.invoice.findUnique({
    where: { number: number.trim().toUpperCase() },
    include: LOOKUP_INCLUDE,
  });
  if (!invoice?.payment) throw new AppError(404, 'INVOICE_NOT_FOUND');
  return {
    invoice: { id: invoice.id, number: invoice.number, issuedAt: invoice.issuedAt.toISOString() },
    order: await loadOrder(db, invoice.orderId),
    payment: toPaymentView(invoice.payment),
    creditNotes: invoice.creditNotes,
    issue: await partialDelivery(db, invoice.orderId),
  };
}

/** What every credit note of today prints, read before its transaction (RG-FAC-07). */
export async function creditNoteContext(db: Db, actor: Actor) {
  const [prefix, legal, cashier] = await Promise.all([
    readSetting(db, 'credit_note_prefix'),
    readStoreLegal(db),
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { fullName: true } }),
  ]);
  return { prefix, legal, cashier: cashier.fullName };
}

/** The refund's one method: active, never credit (H67), its reference given when it asks one (H36). */
export async function refundMethod(tx: Prisma.TransactionClient, refund: OrderRefund['refund']) {
  const method = await tx.paymentMethod.findUnique({ where: { id: refund.methodId } });
  if (!method?.isActive || method.code === CREDIT_METHOD) {
    throw new AppError(409, 'PAYMENT_METHOD_INVALID');
  }
  if (method.requiresReference && !refund.reference) {
    throw new AppError(422, 'REFUND_REFERENCE_REQUIRED');
  }
  return method;
}

/** The next credit note of the shop's year, total or partial, without a gap (RG-FAC-05). */
export async function nextCreditNote(tx: Prisma.TransactionClient, prefix: unknown, now: Date) {
  const year = shopYear(now);
  const seq = await nextSequenceValue(tx, `CREDIT-${year}`);
  const number = invoiceNumber(
    typeof prefix === 'string' && PREFIX.test(prefix) ? prefix : 'AV',
    year,
    seq,
  );
  return { year, seq, number };
}

/**
 * Cancels a paid order before delivery (RG-ANN-02, H36): the manager's password checked first;
 * then, all or nothing, a credit note numbered without a gap for the whole invoice, its refund
 * paid back from the caller's open register, the reservation freed, the order REFUNDED, the
 * invoice CREDITED — never changed otherwise (RG-ANN-05) — and the audit trail.
 */
export async function refundOrder(
  db: Db,
  actor: Actor,
  id: string,
  { version, reason, refund, approval }: OrderRefund,
): Promise<RefundedOrder> {
  const approver = await managerApproval(db, actor, approval);
  const context = await creditNoteContext(db, actor);

  return db.$transaction(async (tx) => {
    const [order] = await tx.$queryRaw<{ status: string; version: number }[]>`
      SELECT "status"::text AS "status", "version" FROM "orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!order) throw new AppError(404, 'NOT_FOUND');
    if (order.status !== 'PAID') throw new AppError(409, 'ORDER_NOT_REFUNDABLE');
    if (order.version !== version) throw new AppError(409, 'ORDER_CHANGED');
    const invoice = await tx.invoice.findUnique({
      where: { orderId: id },
      select: { id: true, number: true, issuedAt: true, snapshot: true },
    });
    if (!invoice) throw new AppError(409, 'ORDER_NOT_REFUNDABLE');
    const session = await lockOpenSession(tx, actor.userId);
    if (!session) throw new AppError(409, 'REGISTER_SESSION_REQUIRED');
    const method = await refundMethod(tx, refund);

    const frozen = invoiceSnapshotSchema.parse(invoice.snapshot);
    const now = new Date();
    const { year, seq, number } = await nextCreditNote(tx, context.prefix, now);
    const amount = frozen.totals.total;
    const snapshot: CreditNoteSnapshot = {
      number,
      issuedOn: shopDate(now),
      issuedAt: formatTime(now),
      legal: context.legal,
      invoice: { number: invoice.number, issuedOn: shopDate(invoice.issuedAt) },
      order: frozen.order,
      customer: frozen.customer,
      lines: frozen.lines,
      totals: frozen.totals,
      amount,
      reason,
      refund: { method: method.label, reference: refund.reference, amount },
      cashier: context.cashier,
      approvedBy: approver.fullName,
    };
    const creditNote: CreditNoteRef = await tx.creditNote.create({
      data: {
        number,
        year,
        seq,
        invoiceId: invoice.id,
        amount,
        reason,
        refundMethodId: method.id,
        refundReference: refund.reference,
        registerSessionId: session.id,
        issuedById: actor.userId,
        approvedById: approver.id,
        issuedAt: now,
        snapshot,
      },
      select: { id: true, number: true },
    });
    await releaseReservations(tx, id);
    await tx.order.update({
      where: { id },
      data: { status: 'REFUNDED', version: { increment: 1 } },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'CREDITED' } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.refunded',
      entityType: 'order',
      entityId: id,
      before: { status: 'PAID', invoice: invoice.number },
      after: {
        status: 'REFUNDED',
        creditNote: number,
        amount,
        refund: { method: method.code, reference: refund.reference },
        approvedById: approver.id,
      },
      reason,
    });
    return { order: await loadOrder(tx, id), creditNote };
  });
}

/** The credit note's PDF as issued (RG-FAC-04/05), made from its frozen content only. */
export async function creditNotePdf(
  db: Db,
  filesDir: string,
  id: string,
): Promise<{ number: string; pdf: Buffer }> {
  const note = await db.creditNote.findUnique({
    where: { id },
    select: { number: true, year: true, snapshot: true, pdfPath: true },
  });
  if (!note) throw new AppError(404, 'NOT_FOUND');
  const pdf = await storedPdf(
    filesDir,
    { folder: 'credit-notes', ...note },
    () => renderPdf(creditNoteDocument(creditNoteSnapshotSchema.parse(note.snapshot))),
    (file) => db.creditNote.update({ where: { id }, data: { pdfPath: file } }),
  );
  return { number: note.number, pdf };
}
