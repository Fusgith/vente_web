import { formatMga, formatQty } from '@vente-web/shared';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces.js';

import type { InvoiceSnapshot } from '../../services/invoices.js';
import { INVOICE_PDF as text } from '../labels.js';
import { INK_2, RULE } from '../style.js';
import { amountRow, documentDefinition, isZero, totalsBlock } from './document.js';

/** HT / TVA / TTC between the discounts and the amount due, VAT-inclusive prices (RG-FAC-03). */
function vatRows(snapshot: InvoiceSnapshot): TableCell[][] {
  if (!snapshot.vat) return [];
  const { rate, base, vat } = snapshot.vat;
  return [
    amountRow(text.vatBase, formatMga(base)),
    amountRow(text.vat(formatQty(rate)), formatMga(vat)),
    amountRow(text.vatTotal, formatMga(snapshot.totals.total)),
  ];
}

/** How it was paid (RG-FAC-02): each method with its reference, then the cash handed and given back. */
function paymentBlock({ payment }: InvoiceSnapshot): Content {
  const rows: TableCell[][] = payment.lines.map((line) => [
    { text: line.method },
    { text: line.reference ? text.reference(line.reference) : '', color: INK_2 },
    { text: formatMga(line.amount), alignment: 'right' },
  ]);
  if (!isZero(payment.cashReceived)) {
    rows.push(
      [
        { text: text.cashReceived, color: INK_2 },
        { text: '' },
        { text: formatMga(payment.cashReceived), alignment: 'right', color: INK_2 },
      ],
      [
        { text: text.change, bold: true },
        { text: '' },
        { text: formatMga(payment.change), alignment: 'right', bold: true },
      ],
    );
  }
  return {
    margin: [0, 16, 0, 0],
    stack: [
      { text: text.payments, style: 'head', margin: [0, 0, 0, 2] },
      {
        layout: {
          hLineWidth: (i) => (i === 0 ? 1 : 0),
          hLineColor: () => RULE,
          vLineWidth: () => 0,
          paddingLeft: (i) => (i === 0 ? 0 : 8),
          paddingRight: (i) => (i === 2 ? 0 : 8),
        },
        table: { widths: ['auto', '*', 'auto'], body: rows },
      },
    ],
  };
}

/**
 * The invoice in A4 (RG-FAC-02, RG-FAC-07, H33), made from its frozen content only: the same
 * table and totals as the quote and the screen, the VAT when on, how it was paid, the footer.
 */
export function invoiceDocument(snapshot: InvoiceSnapshot): TDocumentDefinitions {
  const after: Content[] = [totalsBlock(snapshot.totals, vatRows(snapshot))];
  if (snapshot.vatNotice) {
    after.push({
      text: snapshot.vatNotice,
      alignment: 'right',
      color: INK_2,
      margin: [0, 4, 0, 0],
    });
  }
  after.push(paymentBlock(snapshot));
  return documentDefinition({
    legal: snapshot.legal,
    title: text.title,
    number: snapshot.number,
    meta: [
      [text.issuedOn, snapshot.issuedOn],
      [text.time, snapshot.issuedAt],
      [text.ticket, snapshot.order.ticket],
      [text.order, snapshot.order.number],
      [text.salesUser, snapshot.salesUser],
      [text.cashier, snapshot.cashier],
    ],
    customer: snapshot.customer,
    lines: snapshot.lines,
    after,
    page: (current, count) => text.page(snapshot.number, current, count),
  });
}
