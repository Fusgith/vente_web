import {
  CREDIT_METHOD,
  INSTRUMENT_METHODS,
  invoiceNumber,
  sumAmounts,
  type InstrumentOutcome,
  type Receivable,
  type ReceivableList,
  type ReceivablePayment,
  type ReceivablePaymentInput,
} from '@vente-web/shared';
import { z } from 'zod';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { renderPdf } from '../pdf/render.js';
import { receiptDocument } from '../pdf/templates/receipt.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { storedPdf } from './document-files.js';
import { readStoreLogo } from './store-logo.js';
import { invoiceSnapshotSchema, legalSchema } from './invoices.js';
import { lockOpenSession } from './register-sessions.js';
import { nextSequenceValue } from './sequences.js';
import { shopDate, shopDateValue, shopYear } from './shop-time.js';
import { readStoreLegal } from './store-legal.js';

/** Everything a settlement receipt prints, frozen when it is made (H67). */
export const receiptSnapshotSchema = z.object({
  number: z.string(),
  issuedOn: z.string(),
  legal: legalSchema,
  cashier: z.string(),
  customer: z.object({ name: z.string(), phone: z.string() }),
  invoice: z.object({ number: z.string(), issuedOn: z.string() }),
  dueOn: z.string(),
  amount: z.string(),
  paidBefore: z.string(),
  settled: z.string(),
  method: z.string(),
  reference: z.string().nullable(),
  remaining: z.string(),
});
export type ReceiptSnapshot = z.infer<typeof receiptSnapshotSchema>;

/** Prefix of the receipts' numbers, counted per year without a gap like the invoices'. */
const RECEIPT_PREFIX = 'RC';

const select = {
  id: true,
  amount: true,
  paid: true,
  dueOn: true,
  status: true,
  createdAt: true,
  invoice: { select: { id: true, number: true } },
  customer: { select: { id: true, name: true, phone: true } },
  instrumentNumber: true,
  instrumentBank: true,
  instrumentStatus: true,
  instrumentMethod: { select: { label: true } },
} satisfies Prisma.ReceivableSelect;
type StoredReceivable = Prisma.ReceivableGetPayload<{ select: typeof select }>;

function toView(
  {
    instrumentNumber,
    instrumentBank,
    instrumentStatus,
    instrumentMethod,
    ...row
  }: StoredReceivable,
  today: Date,
): Receivable {
  return {
    ...row,
    amount: row.amount.toFixed(2),
    paid: row.paid.toFixed(2),
    remaining: row.amount.minus(row.paid).toFixed(2),
    dueOn: row.dueOn.toISOString().slice(0, 10),
    // A title still to cash is not overdue: the manager marks it at its due day (H68).
    overdue: row.status === 'OPEN' && instrumentStatus !== 'HANDED' && row.dueOn < today,
    createdAt: row.createdAt.toISOString(),
    instrument:
      instrumentStatus && instrumentMethod
        ? {
            method: instrumentMethod.label,
            number: instrumentNumber ?? '',
            bank: instrumentBank ?? '',
            status: instrumentStatus,
          }
        : null,
  };
}

/**
 * The receivables, the earliest due first (H67): the open ones by default, or the settled ones;
 * `q` finds a customer's name or phone, or an invoice number. With what is left to pay over
 * them, and of it what is overdue.
 */
export async function listReceivables(
  db: Db,
  { status = 'OPEN', q }: { status?: 'OPEN' | 'SETTLED' | undefined; q?: string | undefined },
): Promise<ReceivableList> {
  const search = q?.trim();
  const rows = await db.receivable.findMany({
    where: {
      status,
      ...(search
        ? {
            OR: [
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { phone: { contains: search.replace(/\D/g, '') || search } } },
              { invoice: { number: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    select,
  });
  const today = shopDateValue(new Date());
  const items = rows.map((row) => toView(row, today));
  return {
    items,
    totals: {
      remaining: sumAmounts(['0', ...items.map((item) => item.remaining)]),
      overdue: sumAmounts([
        '0',
        ...items.filter((item) => item.overdue).map((item) => item.remaining),
      ]),
    },
  };
}

/**
 * A payment towards a receivable at the caller's open register (H67, RG-CAI-03): one active
 * method other than credit or a title, its reference if required (RG-PAY-04), at most what is left to pay.
 * Numbered without a gap, the receivable settled once fully paid, audited before → after.
 */
export async function settleReceivable(
  db: Db,
  actor: Actor,
  id: string,
  { methodId, amount, reference }: ReceivablePaymentInput,
): Promise<ReceivablePayment> {
  const legal = await readStoreLegal(db);
  return db.$transaction(async (tx) => {
    // The receivable locked: two payments at once never settle more than is owed.
    await tx.$queryRaw`SELECT 1 FROM "receivables" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const receivable = await tx.receivable.findUnique({
      where: { id },
      select: { ...select, invoice: { select: { id: true, number: true, snapshot: true } } },
    });
    if (!receivable) throw new AppError(404, 'NOT_FOUND');
    if (receivable.status === 'SETTLED') throw new AppError(409, 'RECEIVABLE_SETTLED');
    if (receivable.instrumentStatus === 'HANDED') throw new AppError(409, 'RECEIVABLE_COVERED');
    const session = await lockOpenSession(tx, actor.userId);
    if (!session) throw new AppError(409, 'REGISTER_SESSION_REQUIRED');
    const method = await tx.paymentMethod.findFirst({
      where: {
        id: methodId,
        isActive: true,
        code: { notIn: [CREDIT_METHOD, ...INSTRUMENT_METHODS] },
      },
    });
    if (!method) throw new AppError(409, 'PAYMENT_METHOD_INVALID');
    if (method.requiresReference && !reference) {
      throw new AppError(422, 'PAYMENT_REFERENCE_REQUIRED');
    }
    const remaining = receivable.amount.minus(receivable.paid);
    if (remaining.lt(amount)) throw new AppError(422, 'SETTLEMENT_TOO_HIGH');

    const now = new Date();
    const year = shopYear(now);
    const seq = await nextSequenceValue(tx, `RECEIPT-${year}`);
    const number = invoiceNumber(RECEIPT_PREFIX, year, seq);
    const paid = receivable.paid.plus(amount);
    const status = paid.equals(receivable.amount) ? 'SETTLED' : 'OPEN';
    const cashier = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { fullName: true },
    });
    const snapshot: ReceiptSnapshot = {
      number,
      issuedOn: shopDate(now),
      legal,
      cashier: cashier.fullName,
      customer: { name: receivable.customer.name, phone: receivable.customer.phone },
      invoice: {
        number: receivable.invoice.number,
        issuedOn: invoiceSnapshotSchema.parse(receivable.invoice.snapshot).issuedOn,
      },
      dueOn: shopDate(receivable.dueOn),
      amount: receivable.amount.toFixed(2),
      paidBefore: receivable.paid.toFixed(2),
      settled: sumAmounts([amount]),
      method: method.label,
      reference,
      remaining: receivable.amount.minus(paid).toFixed(2),
    };
    const settlement = await tx.receivableSettlement.create({
      data: {
        number,
        year,
        seq,
        receivableId: id,
        methodId,
        amount,
        reference,
        registerSessionId: session.id,
        cashierId: actor.userId,
        snapshot,
      },
      select: { id: true, number: true, amount: true },
    });
    const updated = await tx.receivable.update({ where: { id }, data: { paid, status }, select });
    await recordAudit(tx, {
      ...by(actor),
      action: 'receivable.settled',
      entityType: 'receivable',
      entityId: id,
      before: { paid: receivable.paid.toFixed(2), status: receivable.status },
      after: {
        paid: paid.toFixed(2),
        status,
        receipt: number,
        method: method.code,
        amount: snapshot.settled,
        reference,
        registerSessionId: session.id,
      },
    });
    return {
      id: settlement.id,
      number: settlement.number,
      amount: settlement.amount.toFixed(2),
      receivable: toView(updated, shopDateValue(now)),
    };
  });
}

/**
 * At its due day, the manager marks the title (H68): cashed, the receivable is settled; unpaid,
 * it is owed again, settled at the register and overdue past its day. Audited before → after.
 */
export async function markInstrument(
  db: Db,
  actor: Actor,
  id: string,
  outcome: InstrumentOutcome,
): Promise<Receivable> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "receivables" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const receivable = await tx.receivable.findUnique({ where: { id }, select });
    if (!receivable) throw new AppError(404, 'NOT_FOUND');
    if (receivable.instrumentStatus !== 'HANDED') {
      throw new AppError(409, 'INSTRUMENT_NOT_HANDED');
    }
    const updated = await tx.receivable.update({
      where: { id },
      data:
        outcome === 'CASHED'
          ? { instrumentStatus: outcome, paid: receivable.amount, status: 'SETTLED' }
          : { instrumentStatus: outcome },
      select,
    });
    await recordAudit(tx, {
      ...by(actor),
      action:
        outcome === 'CASHED' ? 'receivable.instrument_cashed' : 'receivable.instrument_unpaid',
      entityType: 'receivable',
      entityId: id,
      before: { instrument: 'HANDED', paid: receivable.paid.toFixed(2), status: receivable.status },
      after: {
        instrument: outcome,
        number: receivable.instrumentNumber,
        paid: updated.paid.toFixed(2),
        status: updated.status,
      },
    });
    return toView(updated, shopDateValue(new Date()));
  });
}

/** The receipt's PDF as made (H67), from its frozen content only. */
export async function receiptPdf(
  db: Db,
  filesDir: string,
  id: string,
): Promise<{ number: string; pdf: Buffer }> {
  const receipt = await db.receivableSettlement.findUnique({
    where: { id },
    select: { number: true, year: true, snapshot: true, pdfPath: true },
  });
  if (!receipt) throw new AppError(404, 'NOT_FOUND');
  const pdf = await storedPdf(
    filesDir,
    { folder: 'receipts', ...receipt },
    async () =>
      renderPdf(
        receiptDocument(
          receiptSnapshotSchema.parse(receipt.snapshot),
          await readStoreLogo(filesDir),
        ),
      ),
    (file) => db.receivableSettlement.update({ where: { id }, data: { pdfPath: file } }),
  );
  return { number: receipt.number, pdf };
}
