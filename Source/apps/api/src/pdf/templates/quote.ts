import { formatMga, formatPhone, formatQty, type Quote } from '@vente-web/shared';
import type {
  Column,
  Content,
  ContentStack,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces.js';

import type { StoreLegal } from '../../services/store-legal.js';
import { QUOTE_PDF as text } from '../labels.js';
import { INDIGO, INK, INK_2, PDF_FONT, RULE, SAFFRON_SOFT } from '../style.js';

export interface QuoteDocumentContext {
  legal: StoreLegal;
  /** The shop's day of the last save, then the last day of validity (RG-DEV-02), as printed. */
  issuedOn: string;
  validUntil: string;
}

const MARGIN_X = 40;
/** N°, Désignation (the rest), Quantité, Unité, Prix unitaire, Remise, Montant net. */
const COLUMN_WIDTHS = [22, '*', 50, 72, 80, 76, 86];
const RIGHT_ALIGNED = new Set([2, 4, 5, 6]);

const isZero = (amount: string) => Number(amount) === 0;

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

function titleBlock(quote: Quote, context: QuoteDocumentContext): Column {
  const meta = [
    [text.issuedOn, context.issuedOn],
    [text.validUntil, context.validUntil],
    [text.salesUser, quote.salesUser.fullName],
  ];
  return {
    width: 'auto',
    stack: [
      { text: text.title, style: 'title' },
      { text: quote.number, style: 'number' },
      {
        margin: [0, 6, 0, 0],
        layout: 'noBorders',
        table: {
          body: meta.map(([label, value]) => [
            { text: label ?? '', color: INK_2 },
            { text: value ?? '', bold: true },
          ]),
        },
      },
    ],
  };
}

/** The customer, mandatory (RG-DEV-04): an indigo edge, as the chosen customer on the screen. */
function customerBlock(quote: Quote): Content {
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
              { text: quote.customer.name, bold: true, fontSize: 12 },
              { text: formatPhone(quote.customer.phone) },
            ],
          },
        ],
      ],
    },
  };
}

function lineRow(line: Quote['lines'][number]): TableCell[] {
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
    { text: formatMga(line.unitPrice) },
    isZero(line.discountAmount)
      ? { text: '' }
      : {
          stack: [
            { text: text.minus(formatMga(line.discountAmount)) },
            { text: text.pct(formatQty(line.discountPct)), style: 'small' },
          ],
        },
    { text: formatMga(line.net), bold: true },
  ].map((cell, index) => (RIGHT_ALIGNED.has(index) ? { ...cell, alignment: 'right' } : cell));
}

/** The lines as on the screen (RG-DEV-05); the head is repeated on every page. */
function linesTable(quote: Quote): ContentTable {
  const head = Object.values(text.columns).map((label, index): TableCell => ({
    text: label,
    style: 'head',
    alignment: RIGHT_ALIGNED.has(index) ? 'right' : 'left',
  }));
  const rowCount = quote.lines.length + 1;
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
      body: [head, ...quote.lines.map(lineRow)],
    },
  };
}

/**
 * Under the table, in the order of RG-DEV-05, as on the screen: without any discount, the
 * amount due alone.
 */
function totalsBlock(quote: Quote): Content {
  const rows: TableCell[][] = [];
  const row = (label: string, amount: string): TableCell[] => [
    { text: label, color: INK_2 },
    { text: amount, alignment: 'right', color: INK_2 },
  ];
  const discounted = !isZero(quote.discountTotal);
  if (discounted) {
    rows.push(row(text.grossTotal, formatMga(quote.grossTotal)));
    if (!isZero(quote.lineDiscounts)) {
      rows.push(row(text.lineDiscounts, text.minus(formatMga(quote.lineDiscounts))));
    }
    if (!isZero(quote.orderDiscount)) {
      rows.push(row(text.subtotal, formatMga(quote.subtotal)));
      const label = quote.orderDiscountPct
        ? text.orderDiscountPct(formatQty(quote.orderDiscountPct))
        : text.orderDiscount;
      rows.push(row(label, text.minus(formatMga(quote.orderDiscount))));
    }
  }
  rows.push([
    { text: text.total, bold: true, fontSize: 12, margin: [0, 2, 0, 0] },
    { text: formatMga(quote.total), bold: true, fontSize: 15, alignment: 'right' },
  ]);
  if (discounted) rows.push(row(text.discountTotal, text.minus(formatMga(quote.discountTotal))));
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

/** RG-FAC-06: on saffron, as what is still in progress on the screens. */
function noticeBlock(validUntil: string): Content {
  return {
    margin: [0, 18, 0, 0],
    layout: 'noBorders',
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: text.notice(validUntil),
            bold: true,
            fillColor: SAFFRON_SOFT,
            margin: [8, 6, 8, 6],
          },
        ],
      ],
    },
  };
}

/** The quote in A4 (RG-DEV-05, RG-FAC-06, RG-FAC-07): the same table and totals as the screen. */
export function quoteDocument(quote: Quote, context: QuoteDocumentContext): TDocumentDefinitions {
  const { legal } = context;
  return {
    pageSize: 'A4',
    pageMargins: [MARGIN_X, 40, MARGIN_X, 56],
    info: { title: `${text.title} ${quote.number}`, ...(legal.name ? { author: legal.name } : {}) },
    defaultStyle: { font: PDF_FONT, fontSize: 9.5, color: INK, lineHeight: 1.15 },
    styles: {
      store: { fontSize: 13, bold: true },
      title: { fontSize: 22, bold: true, color: INDIGO, alignment: 'right' },
      number: { fontSize: 13, bold: true, alignment: 'right' },
      head: { fontSize: 9, bold: true, color: INK_2 },
      small: { fontSize: 8, color: INK_2 },
    },
    content: [
      { columns: [{ width: '*', ...storeBlock(legal) }, titleBlock(quote, context)] },
      customerBlock(quote),
      linesTable(quote),
      totalsBlock(quote),
      noticeBlock(context.validUntil),
    ],
    footer: (currentPage, pageCount) => ({
      margin: [MARGIN_X, 20, MARGIN_X, 0],
      fontSize: 8,
      color: INK_2,
      columns: [
        { text: legal.footer },
        { text: text.page(quote.number, currentPage, pageCount), alignment: 'right' },
      ],
    }),
  };
}
