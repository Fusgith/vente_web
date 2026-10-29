import { formatMga } from '@vente-web/shared';
import type { TDocumentDefinitions } from 'pdfmake/interfaces.js';

import type { ReceiptSnapshot } from '../../services/receivables.js';
import { RECEIPT_PDF as text } from '../labels.js';
import { INK_2, RULE } from '../style.js';
import { documentDefinition } from './document.js';

/**
 * The receipt of a payment towards a receivable in A4 (H67), made from its frozen content only:
 * the invoice it settles, what was owed, what this payment settles and what is left to pay.
 */
export function receiptDocument(
  snapshot: ReceiptSnapshot,
  logo: string | null = null,
): TDocumentDefinitions {
  const row = (label: string, value: string, bold = false) => [
    { text: label, color: INK_2 },
    { text: value, bold, alignment: 'right' as const },
  ];
  return documentDefinition({
    legal: snapshot.legal,
    logo,
    title: text.title,
    number: snapshot.number,
    meta: [
      [text.issuedOn, snapshot.issuedOn],
      [text.cashier, snapshot.cashier],
      [text.invoice, `${snapshot.invoice.number} (${snapshot.invoice.issuedOn})`],
      [text.dueOn, snapshot.dueOn],
    ],
    customer: snapshot.customer,
    lines: [],
    after: [
      {
        margin: [0, 16, 0, 0],
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 1 : 0),
          hLineColor: () => RULE,
          vLineWidth: () => 0,
          paddingLeft: (i) => (i === 0 ? 0 : 8),
          paddingRight: (i) => (i === 1 ? 0 : 8),
        },
        table: {
          widths: ['*', 'auto'],
          body: [
            row(text.amount, formatMga(snapshot.amount)),
            row(text.paidBefore, formatMga(snapshot.paidBefore)),
            row(
              snapshot.reference
                ? `${text.settled} — ${snapshot.method}, ${text.reference.toLowerCase()} ${snapshot.reference}`
                : `${text.settled} — ${snapshot.method}`,
              formatMga(snapshot.settled),
              true,
            ),
            row(text.remaining, formatMga(snapshot.remaining), true),
          ],
        },
      },
    ],
    page: (current, count) => text.page(snapshot.number, current, count),
  });
}
