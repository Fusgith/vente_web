import {
  formatTime,
  invoiceNumber,
  quoteLineSchema,
  ticketLabel,
  vatBreakdown,
  type InvoiceRef,
  type Order,
} from '@vente-web/shared';
import { z } from 'zod';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { renderPdf } from '../pdf/render.js';
import { invoiceDocument } from '../pdf/templates/invoice.js';
import { storedPdf } from './document-files.js';
import { nextSequenceValue } from './sequences.js';
import { readSetting } from './settings.js';
import { shopDate, shopYear } from './shop-time.js';
import { readStoreLegal, type StoreLegal } from './store-legal.js';

const legalSchema = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  nif: z.string(),
  stat: z.string(),
  rcs: z.string(),
  footer: z.string(),
}) satisfies z.ZodType<StoreLegal>;

/**
 * Everything an invoice prints, frozen when issued (RG-FAC-02, H33): the PDF is made from it
 * alone, never from the settings of the moment (RG-FAC-04).
 */
export const invoiceSnapshotSchema = z.object({
  number: z.string(),
  issuedOn: z.string(),
  issuedAt: z.string(),
  legal: legalSchema,
  order: z.object({ number: z.string(), ticket: z.string() }),
  salesUser: z.string(),
  cashier: z.string(),
  customer: z.object({ name: z.string(), phone: z.string() }),
  lines: z.array(quoteLineSchema),
  totals: z.object({
    grossTotal: z.string(),
    lineDiscounts: z.string(),
    subtotal: z.string(),
    orderDiscountPct: z.string().nullable(),
    orderDiscount: z.string(),
    discountTotal: z.string(),
    total: z.string(),
  }),
  /** The owner's code used on the order (RG-REM-07); absent from invoices issued before it. */
  discountCode: z.string().nullable().default(null),
  /** The code answered a request: printed « Remise accordée par le boss », never the code (H64). */
  discountGranted: z.boolean().default(false),
  vat: z.object({ rate: z.string(), base: z.string(), vat: z.string() }).nullable(),
  vatNotice: z.string(),
  payment: z.object({
    lines: z.array(
      z.object({ method: z.string(), reference: z.string().nullable(), amount: z.string() }),
    ),
    cashReceived: z.string(),
    change: z.string(),
  }),
});
export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;

/** The settings an invoice freezes, read before the payment's transaction. */
export interface InvoiceSettings {
  prefix: string;
  legal: StoreLegal;
  /** VAT rate in %, or null when VAT is off (RG-FAC-03). */
  vatRate: string | null;
  vatNotice: string;
}

const PREFIX = /^[A-Z0-9]{1,6}$/;
const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 120) : '');

export async function readInvoiceSettings(db: Db): Promise<InvoiceSettings> {
  const [prefix, legal, enabled, rate, notice] = await Promise.all([
    readSetting(db, 'invoice_prefix'),
    readStoreLegal(db),
    readSetting(db, 'vat_enabled'),
    readSetting(db, 'vat_rate'),
    readSetting(db, 'vat_notice'),
  ]);
  const vatRate =
    enabled === true && typeof rate === 'number' && rate >= 0 && rate <= 100
      ? String(Math.round(rate * 100) / 100)
      : null;
  return {
    prefix: typeof prefix === 'string' && PREFIX.test(prefix) ? prefix : 'F',
    legal,
    vatRate,
    vatNotice: vatRate === null ? text(notice) : '',
  };
}

export interface IssueInput {
  order: Order;
  cashier: string;
  payment: InvoiceSnapshot['payment'];
  settings: InvoiceSettings;
  at: Date;
}

/**
 * Issues the invoice of an order being paid, inside the payment's transaction (RG-FAC-01): the
 * yearly counter's row locked, so two payments never share a number, and a payment that fails
 * gives its number back — no gap, ever. Its content is frozen here (RG-FAC-02).
 */
export async function issueInvoice(
  tx: Prisma.TransactionClient,
  { order, cashier, payment, settings, at }: IssueInput,
): Promise<InvoiceRef> {
  const year = shopYear(at);
  const seq = await nextSequenceValue(tx, `INVOICE-${year}`);
  const number = invoiceNumber(settings.prefix, year, seq);
  const snapshot: InvoiceSnapshot = {
    number,
    issuedOn: shopDate(at),
    issuedAt: formatTime(at),
    legal: settings.legal,
    order: { number: order.number, ticket: order.ticket ? ticketLabel(order.ticket) : '' },
    salesUser: order.salesUser.fullName,
    cashier,
    customer: { name: order.customer.name, phone: order.customer.phone },
    lines: order.lines,
    totals: {
      grossTotal: order.grossTotal,
      lineDiscounts: order.lineDiscounts,
      subtotal: order.subtotal,
      orderDiscountPct: order.orderDiscountPct,
      orderDiscount: order.orderDiscount,
      discountTotal: order.discountTotal,
      total: order.total,
    },
    discountCode: order.discountCode?.code ?? null,
    discountGranted: order.discountCode?.granted ?? false,
    vat: settings.vatRate
      ? { rate: settings.vatRate, ...pickVat(order.total, settings.vatRate) }
      : null,
    vatNotice: settings.vatNotice,
    payment,
  };
  const invoice = await tx.invoice.create({
    data: { number, year, seq, orderId: order.id, issuedAt: at, snapshot },
    select: { id: true, number: true },
  });
  return invoice;
}

function pickVat(total: string, rate: string) {
  const { base, vat } = vatBreakdown(total, rate);
  return { base, vat };
}

/** The invoice's PDF as issued (RG-FAC-04), made from its frozen content only. */
export async function invoicePdf(
  db: Db,
  filesDir: string,
  id: string,
): Promise<{ number: string; pdf: Buffer }> {
  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { number: true, year: true, snapshot: true, pdfPath: true },
  });
  if (!invoice) throw new AppError(404, 'NOT_FOUND');
  const pdf = await storedPdf(
    filesDir,
    { folder: 'invoices', ...invoice },
    () => renderPdf(invoiceDocument(invoiceSnapshotSchema.parse(invoice.snapshot))),
    (file) => db.invoice.update({ where: { id }, data: { pdfPath: file } }),
  );
  return { number: invoice.number, pdf };
}
