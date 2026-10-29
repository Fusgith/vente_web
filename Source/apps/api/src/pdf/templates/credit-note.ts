import { formatAmount, formatMga, formatQty } from '@vente-web/shared';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';

import type { CreditNoteSnapshot } from '../../services/credit-notes.js';
import { CREDIT_NOTE_PDF as text } from '../labels.js';
import { INK_2, MADDER, RULE } from '../style.js';
import { documentDefinition, totalsBlock } from './document.js';

/** The amount credited, the reason and the refund (RG-FAC-05). */
function refundBlock(snapshot: CreditNoteSnapshot): Content {
  const { refund } = snapshot;
  return {
    margin: [0, 16, 0, 0],
    layout: {
      hLineWidth: (i) => (i === 0 ? 1 : 0),
      hLineColor: () => RULE,
      vLineWidth: () => 0,
      paddingLeft: (i) => (i === 0 ? 0 : 8),
      paddingRight: (i) => (i === 1 ? 0 : 8),
    },
    table: {
      widths: [130, '*'],
      body: [
        [
          { text: text.credited, bold: true, color: MADDER },
          { text: formatMga(snapshot.amount), bold: true, fontSize: 13, color: MADDER },
        ],
        [{ text: text.reason, color: INK_2 }, { text: snapshot.reason }],
        [
          { text: text.refund, color: INK_2 },
          {
            text: [
              `${refund.method} — ${formatMga(refund.amount)}`,
              refund.reference ? ` (${text.reference(refund.reference)})` : '',
            ].join(''),
          },
        ],
      ],
    },
  };
}

/** A partial credit note (H37): each line not handed over, its cause and its credit. */
function creditedBlock(credited: NonNullable<CreditNoteSnapshot['credited']>): Content {
  const head = text.creditedColumns.map((label, index) => ({
    text: label,
    bold: true,
    color: INK_2,
    alignment: index === 0 ? ('left' as const) : ('right' as const),
  }));
  return {
    margin: [0, 16, 0, 0],
    stack: [
      { text: text.notHandedOver, bold: true, margin: [0, 0, 0, 4] },
      {
        layout: {
          hLineWidth: (i) => (i === 1 ? 1 : 0),
          hLineColor: () => RULE,
          vLineWidth: () => 0,
        },
        table: {
          headerRows: 1,
          widths: ['*', 90, 70, 90],
          body: [
            head,
            ...credited.map((line) => [
              { text: line.name },
              { text: `${formatQty(line.qty)} ${line.unitLabel}`, alignment: 'right' as const },
              { text: text.causes[line.cause], alignment: 'right' as const },
              { text: formatAmount(line.amount), alignment: 'right' as const },
            ]),
          ],
        },
      },
    ],
  };
}

/**
 * The credit note in A4 (RG-FAC-05, RG-ANN-02, H36), made from its frozen content only: the
 * lines credited as on the invoice, their totals, the amount credited with the reason and the
 * refund; the original invoice named, never changed (RG-ANN-05).
 */
export function creditNoteDocument(
  snapshot: CreditNoteSnapshot,
  logo: string | null = null,
): TDocumentDefinitions {
  return documentDefinition({
    legal: snapshot.legal,
    logo,
    title: text.title,
    number: snapshot.number,
    meta: [
      [text.issuedOn, snapshot.issuedOn],
      [text.time, snapshot.issuedAt],
      [text.invoice, `${snapshot.invoice.number} (${snapshot.invoice.issuedOn})`],
      [text.ticket, snapshot.order.ticket],
      [text.cashier, snapshot.cashier],
      [snapshot.credited ? text.decidedBy : text.approvedBy, snapshot.approvedBy],
    ],
    customer: snapshot.customer,
    lines: snapshot.lines,
    after: [
      totalsBlock(snapshot.totals, [], text.invoiceTotal),
      ...(snapshot.credited ? [creditedBlock(snapshot.credited)] : []),
      refundBlock(snapshot),
      { text: text.notice(snapshot.invoice.number), color: INK_2, margin: [0, 12, 0, 0] },
    ],
    page: (current, count) => text.page(snapshot.number, current, count),
  });
}
