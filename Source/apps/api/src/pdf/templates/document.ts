import { formatAmount, formatMga, formatPhone, formatQty, type QuoteLine } from '@vente-web/shared';
import type {
  Column,
  Content,
  ContentStack,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces.js';

import type { StoreLegal } from '../../services/store-legal.js';
import { DOCUMENT_PDF as text } from '../labels.js';
import { INDIGO, INK, INK_2, PDF_FONT, RULE } from '../style.js';

/**
 * What the quote and the invoice share in A4 (RG-DEV-05, RG-FAC-02, RG-FAC-07): the shop, the
 * customer, the lines as on the screen and the totals in the same order — so that the two
 * documents never drift apart.
 */

const MARGIN_X = 40;
/** N°, Désignation (the rest), Quantité, Unité, Prix unitaire, Remise, Montant net. */
const COLUMN_WIDTHS = [22, '*', 50, 72, 66, 62, 74];
const RIGHT_ALIGNED = new Set([2, 4, 5, 6]);
/** Prix unitaire, Remise, Montant net: the sign once in the head, the figures alone (RG-FMT-01). */
const AMOUNTS = new Set([4, 5, 6]);

export const isZero = (amount: string) => Number(amount) === 0;

/** Legal mentions (RG-FAC-07): only the fields filled in, one per line. */
function storeBlock(legal: StoreLegal): ContentStack {
  const ids = (['nif', 'stat', 'rcs'] as const)
    .filter((key) => legal[key] !== '')
    .map((key) => `${text.legalIds[key]} ${legal[key]}`);
  const lines = [legal.address, legal.phone && text.phone(legal.phone), ...ids].filter(
    (line) => line !== '',
  );
  return {
    stack: [
      ...(legal.name ? [{ text: legal.name, style: 'store' }] : []),
      ...lines.map((line) => ({ text: line, color: INK_2 })),
    ],
  };
}

/** The title, the number and label/value pairs, on the right of the shop. */
function titleBlock(title: string, number: string, meta: [string, string][]): Column {
  return {
    width: 'auto',
    stack: [
      { text: title, style: 'title' },
      { text: number, style: 'number' },
      {
        margin: [0, 6, 0, 0],
        layout: 'noBorders',
        table: {
          body: meta.map(([label, value]) => [
            { text: label, color: INK_2 },
            { text: value, bold: true },
          ]),
        },
      },
    ],
  };
}

/** The customer, mandatory (RG-DEV-04): an indigo edge, as the chosen customer on the screen. */
function customerBlock(customer: { name: string; phone: string }): Content {
  return {
    margin: [0, 18, 0, 14],
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i) => (i === 0 ? 3 : 0),
      vLineColor: () => INDIGO,
      paddingLeft: () => 8,
    },
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: text.customer, color: INK_2 },
              { text: customer.name, bold: true, fontSize: 12 },
              { text: formatPhone(customer.phone) },
            ],
          },
        ],
      ],
    },
  };
}

function lineRow(line: QuoteLine): TableCell[] {
  const factor = formatQty(line.factor);
  return [
    { text: String(line.position) },
    { stack: [{ text: line.sku, style: 'small' }, { text: line.name }] },
    { text: formatQty(line.qty), bold: true },
    {
      stack: [
        { text: line.unitLabel },
        ...(factor === '1' ? [] : [{ text: text.factorOf(factor, line.baseUnit), style: 'small' }]),
      ],
    },
    { text: formatAmount(line.unitPrice) },
    isZero(line.discountAmount)
      ? { text: '' }
      : {
          stack: [
            { text: text.minus(formatAmount(line.discountAmount)) },
            { text: text.pct(formatQty(line.discountPct)), style: 'small' },
          ],
        },
    { text: formatAmount(line.net), bold: true },
  ].map((cell, index) => (RIGHT_ALIGNED.has(index) ? { ...cell, alignment: 'right' } : cell));
}

/**
 * The lines as on the screen (RG-DEV-05); the head is repeated on every page, and aligned to
 * the bottom since the amount columns take two lines.
 */
function linesTable(lines: readonly QuoteLine[]): ContentTable {
  const head = Object.values(text.columns).map((label, index): TableCell => ({
    text: AMOUNTS.has(index) ? [label, { text: `\n${text.inCurrency}`, bold: false }] : label,
    verticalAlignment: 'bottom',
    style: 'head',
    alignment: RIGHT_ALIGNED.has(index) ? 'right' : 'left',
  }));
  const rowCount = lines.length + 1;
  return {
    layout: {
      hLineWidth: (i) => (i === 1 || i === rowCount ? 1.5 : i === 0 ? 0 : 0.5),
      hLineColor: (i) => (i === 1 || i === rowCount ? INK : RULE),
      vLineWidth: () => 0,
      paddingLeft: (i) => (i === 0 ? 0 : 4),
      paddingRight: (i) => (i === COLUMN_WIDTHS.length - 1 ? 0 : 4),
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: COLUMN_WIDTHS,
      body: [head, ...lines.map(lineRow)],
    },
  };
}

/** The totals a document prints (RG-DEV-05). */
export interface DocumentTotals {
  grossTotal: string;
  lineDiscounts: string;
  subtotal: string;
  orderDiscountPct: string | null;
  orderDiscount: string;
  discountTotal: string;
  total: string;
}

/** A label and its amount, as a row under the table. */
export function amountRow(label: string, amount: string): TableCell[] {
  return [
    { text: label, color: INK_2 },
    { text: amount, alignment: 'right', color: INK_2 },
  ];
}

/**
 * Under the table, in the order of RG-DEV-05, as on the screen: without any discount, the
 * amount due alone. `beforeTotal` goes between the discounts and the amount due (the VAT of
 * an invoice, RG-FAC-03). `totalLabel` names that amount otherwise (a credit note owes nothing).
 */
export function totalsBlock(
  totals: DocumentTotals,
  beforeTotal: TableCell[][] = [],
  totalLabel: string = text.total,
): Content {
  const rows: TableCell[][] = [];
  const discounted = !isZero(totals.discountTotal);
  if (discounted) {
    rows.push(amountRow(text.grossTotal, formatMga(totals.grossTotal)));
    if (!isZero(totals.lineDiscounts)) {
      rows.push(amountRow(text.lineDiscounts, text.minus(formatMga(totals.lineDiscounts))));
    }
    if (!isZero(totals.orderDiscount)) {
      rows.push(amountRow(text.subtotal, formatMga(totals.subtotal)));
      const label = totals.orderDiscountPct
        ? text.orderDiscountPct(formatQty(totals.orderDiscountPct))
        : text.orderDiscount;
      rows.push(amountRow(label, text.minus(formatMga(totals.orderDiscount))));
    }
  }
  rows.push(...beforeTotal);
  rows.push([
    { text: totalLabel, bold: true, fontSize: 12, margin: [0, 2, 0, 0] },
    { text: formatMga(totals.total), bold: true, fontSize: 15, alignment: 'right' },
  ]);
  if (discounted) {
    rows.push(amountRow(text.discountTotal, text.minus(formatMga(totals.discountTotal))));
  }
  return {
    margin: [0, 8, 0, 0],
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        layout: { defaultBorder: false, paddingLeft: (i) => (i === 0 ? 0 : 24) },
        table: { body: rows },
      },
    ],
  };
}

export interface DocumentFrame {
  legal: StoreLegal;
  title: string;
  number: string;
  meta: [string, string][];
  customer: { name: string; phone: string };
  lines: readonly QuoteLine[];
  /** Totals, then what the document adds under them. */
  after: Content[];
  page: (current: number, count: number) => string;
}

/** A4, the shop and the title, the customer, the lines, then the rest (RG-DEV-05, RG-FAC-07). */
export function documentDefinition(frame: DocumentFrame): TDocumentDefinitions {
  const { legal } = frame;
  return {
    pageSize: 'A4',
    pageMargins: [MARGIN_X, 40, MARGIN_X, 56],
    info: {
      title: `${frame.title} ${frame.number}`,
      ...(legal.name ? { author: legal.name } : {}),
    },
    defaultStyle: { font: PDF_FONT, fontSize: 9.5, color: INK, lineHeight: 1.15 },
    styles: {
      store: { fontSize: 13, bold: true },
      title: { fontSize: 22, bold: true, color: INDIGO, alignment: 'right' },
      number: { fontSize: 13, bold: true, alignment: 'right' },
      head: { fontSize: 9, bold: true, color: INK_2 },
      small: { fontSize: 8, color: INK_2 },
    },
    content: [
      {
        columns: [
          { width: '*', ...storeBlock(legal) },
          titleBlock(frame.title, frame.number, frame.meta),
        ],
      },
      customerBlock(frame.customer),
      linesTable(frame.lines),
      ...frame.after,
    ],
    footer: (currentPage, pageCount) => ({
      margin: [MARGIN_X, 20, MARGIN_X, 0],
      fontSize: 8,
      color: INK_2,
      columns: [
        { text: legal.footer },
        { text: frame.page(currentPage, pageCount), alignment: 'right' },
      ],
    }),
  };
}
