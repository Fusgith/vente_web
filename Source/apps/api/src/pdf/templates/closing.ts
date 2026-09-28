import {
  CASH_METHOD,
  formatAmount,
  formatMga,
  formatTime,
  type SessionSummary,
} from '@vente-web/shared';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces.js';

import { shopDate } from '../../services/shop-time.js';
import type { StoreLegal } from '../../services/store-legal.js';
import { CLOSING_PDF as text } from '../labels.js';
import { INDIGO, INK, INK_2, MADDER, PDF_FONT, RULE } from '../style.js';

export interface ClosingReport {
  legal: StoreLegal;
  summary: SessionSummary;
  invoices: { number: string; total: string }[];
}

const when = (iso: string) => text.at(shopDate(new Date(iso)), formatTime(iso));

/** A plain table: a bold head, thin rules, amounts on the right under « (MGA) » (RG-FMT-01). */
function table(
  head: string[],
  rows: TableCell[][],
  widths: (string | number)[],
  right: Set<number>,
): Content {
  return {
    layout: {
      hLineWidth: (i) => (i === 1 ? 1 : 0.5),
      hLineColor: (i) => (i === 1 ? INK : RULE),
      vLineWidth: () => 0,
      paddingLeft: (i) => (i === 0 ? 0 : 6),
      paddingRight: (i) => (i === widths.length - 1 ? 0 : 6),
    },
    table: {
      headerRows: 1,
      widths,
      body: [
        head.map((label, index) => ({
          text: label,
          style: 'head',
          alignment: right.has(index) ? 'right' : 'left',
        })),
        ...rows,
      ],
    },
  };
}

/**
 * The closing report in A4 (RG-CAI-03, ⚠️ H35): who, where, when; what each method took; the
 * cash expected, counted and the variance with its comment; the invoices of the session.
 */
export function closingDocument({ legal, summary, invoices }: ClosingReport): TDocumentDefinitions {
  const cash = summary.byMethod.find((method) => method.code === CASH_METHOD)?.total ?? '0.00';
  const variance = summary.variance;
  const off = variance !== null && variance !== '0.00';
  const row = (label: string, amount: string, strong = false, color = INK): TableCell[] => [
    { text: label, color: strong ? color : INK_2, bold: strong },
    { text: formatMga(amount), alignment: 'right', bold: strong, color },
  ];
  const cashRows = [
    row(text.openingFloat, summary.openingFloat),
    row(text.cashTaken, cash),
    row(text.cashExpected, summary.cashExpected, true),
    ...(summary.countedCash === null
      ? []
      : [
          row(text.countedCash, summary.countedCash),
          row(text.variance, variance ?? '0.00', true, off ? MADDER : INK),
        ]),
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 56],
    info: { title: `${text.title} ${summary.station.name}` },
    defaultStyle: { font: PDF_FONT, fontSize: 10, color: INK, lineHeight: 1.2 },
    styles: {
      title: { fontSize: 20, bold: true, color: INDIGO },
      section: { fontSize: 12, bold: true, margin: [0, 16, 0, 6] },
      head: { fontSize: 9, bold: true, color: INK_2 },
    },
    content: [
      ...(legal.name ? [{ text: legal.name, bold: true, fontSize: 12 }] : []),
      {
        text: summary.closedAt ? text.title : `${text.title} — ${text.open}`,
        style: 'title',
        margin: [0, 6, 0, 8],
      },
      {
        layout: 'noBorders',
        table: {
          body: [
            [text.register, summary.station.name],
            [text.cashier, summary.cashier.fullName],
            [text.openedAt, when(summary.openedAt)],
            [text.closedAt, summary.closedAt ? when(summary.closedAt) : text.notClosed],
          ].map(([label, value]) => [
            { text: label ?? '', color: INK_2 },
            { text: value ?? '', bold: true },
          ]),
        },
      },
      { text: text.byMethod, style: 'section' },
      summary.byMethod.length === 0
        ? { text: text.none, color: INK_2 }
        : table(
            [text.method, text.payments, `${text.total} ${text.inCurrency}`],
            summary.byMethod.map((method) => [
              { text: method.label },
              { text: String(method.count), alignment: 'right' },
              { text: formatAmount(method.total), alignment: 'right', bold: true },
            ]),
            ['*', 70, 110],
            new Set([1, 2]),
          ),
      { text: text.cash, style: 'section' },
      { layout: 'noBorders', table: { widths: [180, 140], body: cashRows } },
      ...(summary.note ? [{ text: text.note, style: 'section' }, { text: summary.note }] : []),
      ...(invoices.length > 0
        ? [
            { text: text.invoices, style: 'section' },
            table(
              [text.invoice, `${text.amount} ${text.inCurrency}`],
              invoices.map((invoice) => [
                { text: invoice.number },
                { text: formatAmount(invoice.total), alignment: 'right' },
              ]),
              ['*', 110],
              new Set([1]),
            ),
          ]
        : []),
    ],
    footer: (current, count) => ({
      margin: [40, 20, 40, 0],
      fontSize: 8,
      color: INK_2,
      text: text.page(summary.station.name, current, count),
      alignment: 'right',
    }),
  };
}
