import {
  formatTime,
  type CreditNoteRef,
  type PartialRefund,
  type RefundedOrder,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { CREDIT_NOTE_PDF as text } from '../pdf/labels.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import {
  creditNoteContext,
  nextCreditNote,
  refundMethod,
  type CreditNoteSnapshot,
} from './credit-notes.js';
import { ISSUE_INCLUDE } from './delivery-issues.js';
import { invoiceSnapshotSchema } from './invoices.js';
import { loadOrder } from './orders.js';
import { lockOpenSession } from './register-sessions.js';
import { shopDate } from './shop-time.js';

/**
 * Refunds what a partial delivery left (RG-ANN-03, H37), once: the amount the manager's
 * decision froze, in one method, from the caller's open register. In the same operation, a
 * partial credit note on the same gap-free counter as the whole one — the lines not handed over,
 * their causes and credits, the manager who decided — and the invoice « partially credited »,
 * never changed otherwise (RG-ANN-05). No password: the manager already decided.
 */
export async function refundPartly(
  db: Db,
  actor: Actor,
  id: string,
  { issueId, refund }: PartialRefund,
): Promise<RefundedOrder> {
  const context = await creditNoteContext(db, actor);
  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "delivery_issues"
       WHERE "id" = ${issueId}::uuid AND "order_id" = ${id}::uuid FOR UPDATE`;
    if (!locked) throw new AppError(404, 'NOT_FOUND');
    const issue = await tx.deliveryIssue.findUniqueOrThrow({
      where: { id: issueId },
      include: ISSUE_INCLUDE,
    });
    const { creditAmount, decidedById, decidedBy } = issue;
    if (issue.resolution !== 'PARTLY_DELIVERED' || issue.creditNoteId) {
      throw new AppError(409, 'CREDIT_NOT_PENDING');
    }
    if (!creditAmount || !decidedById || !decidedBy) throw new AppError(409, 'CREDIT_NOT_PENDING');
    const invoice = await tx.invoice.findUnique({
      where: { orderId: id },
      select: { id: true, number: true, issuedAt: true, status: true, snapshot: true },
    });
    if (!invoice) throw new AppError(409, 'CREDIT_NOT_PENDING');
    const session = await lockOpenSession(tx, actor.userId);
    if (!session) throw new AppError(409, 'REGISTER_SESSION_REQUIRED');
    const method = await refundMethod(tx, refund);

    const frozen = invoiceSnapshotSchema.parse(invoice.snapshot);
    const now = new Date();
    const { year, seq, number } = await nextCreditNote(tx, context.prefix, now);
    const amount = creditAmount.toFixed(2);
    const lines = [...issue.lines].sort((a, b) => a.orderLine.position - b.orderLine.position);
    const causes = [...new Set(lines.map((line) => text.causes[line.cause].toLowerCase()))];
    const reason = text.partialReason(causes.join(', '), issue.note).slice(0, 300);
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
      approvedBy: decidedBy.fullName,
      credited: lines.map((line) => ({
        name: line.orderLine.name,
        unitLabel: line.orderLine.unitLabel,
        qty: line.qty.toFixed(),
        cause: line.cause,
        amount: line.creditAmount?.toFixed(2) ?? '0.00',
      })),
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
        approvedById: decidedById,
        issuedAt: now,
        snapshot,
      },
      select: { id: true, number: true },
    });
    await tx.deliveryIssue.update({
      where: { id: issueId },
      data: { creditNoteId: creditNote.id },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PARTIALLY_CREDITED' },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.partly_refunded',
      entityType: 'order',
      entityId: id,
      before: { invoice: invoice.number, invoiceStatus: invoice.status, issueId },
      after: {
        invoiceStatus: 'PARTIALLY_CREDITED',
        creditNote: number,
        amount,
        refund: { method: method.code, reference: refund.reference },
        decidedById,
      },
      reason,
    });
    return { order: await loadOrder(tx, id), creditNote };
  });
}
