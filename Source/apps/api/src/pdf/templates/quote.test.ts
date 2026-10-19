import { formatAmount, formatMga, type Quote } from '@vente-web/shared';
import type { ContentColumns, ContentTable } from 'pdfmake/interfaces.js';
import { describe, expect, it } from 'vitest';

import { renderPdf } from '../render.js';
import { quoteDocument, type QuoteDocumentContext } from './quote.js';

const ID = '00000000-0000-4000-8000-000000000001';

/** 2 packs of soap at 5 % and 3 kg of nails, 2 000 off the total. */
function sampleQuote(): Quote {
  const line = {
    productId: ID,
    productUnitId: ID,
    capPct: '15',
    discountPct: '0.00',
    discountAmount: '0.00',
    discountSource: 'NONE' as const,
  };
  return {
    id: ID,
    number: 'D-2026-000042',
    version: 1,
    customer: { id: ID, name: 'Rasoa Hanta', phone: '0341122233', type: 'INDIVIDUAL' },
    salesUser: { id: ID, fullName: 'Vola Rakoto' },
    lines: [
      {
        ...line,
        position: 1,
        sku: 'SAV-001',
        name: 'Savon de ménage 400 g',
        unitLabel: 'paquet',
        factor: '6',
        baseUnit: 'pièce',
        qty: '2',
        unitPrice: '25000.00',
        gross: '50000.00',
        discountPct: '5.00',
        discountAmount: '2500.00',
        discountSource: 'WITHIN_CAP',
        net: '47500.00',
      },
      {
        ...line,
        position: 2,
        sku: 'CLO-001',
        name: 'Clous 70 mm',
        unitLabel: 'kg',
        factor: '1',
        baseUnit: 'kg',
        qty: '3',
        unitPrice: '6500.00',
        gross: '19500.00',
        net: '19500.00',
      },
    ],
    grossTotal: '69500.00',
    lineDiscounts: '2500.00',
    subtotal: '67000.00',
    orderDiscountPct: null,
    orderDiscount: '2000.00',
    discountTotal: '4500.00',
    discountCode: null,
    discountRequest: null,
    total: '65000.00',
    createdAt: '2026-09-26T09:00:00.000Z',
    updatedAt: '2026-09-26T09:00:00.000Z',
  };
}

const context: QuoteDocumentContext = {
  legal: {
    name: 'Quincaillerie Rasoa',
    address: 'Lot II J 45, Analakely, Antananarivo',
    phone: '020 22 123 45',
    nif: '1234567890',
    stat: '',
    rcs: '',
    footer: 'Merci de votre confiance',
  },
  issuedOn: '26/09/2026',
  validUntil: '03/10/2026',
};

const parts = (quote: Quote) => {
  const [, , lines, totals, notice] = quoteDocument(quote, context).content as [
    unknown,
    unknown,
    ContentTable,
    ContentColumns,
    ContentTable,
  ];
  const totalRows = (totals.columns[1] as ContentTable).table.body;
  return { lines: lines.table.body, totalRows, notice: notice.table.body };
};

describe('quote PDF (RG-DEV-05, RG-FAC-06, RG-FAC-07)', () => {
  it('prints the lines, the totals of the screen and the notice', () => {
    const { lines, totalRows, notice } = parts(sampleQuote());
    expect(lines).toHaveLength(3);
    expect(JSON.stringify(lines[1])).toContain('(× 6 pièce)');
    expect(JSON.stringify(lines[2])).not.toContain('(×');
    // The sign once in the head of each amount column, the figures alone in its cells (RG-FMT-01).
    expect(lines[0]![6]).toMatchObject({ text: ['Montant net', { text: '\n(MGA)' }] });
    expect(lines[2]![6]).toMatchObject({ text: formatAmount('19500') });
    expect(JSON.stringify(lines.slice(1))).not.toContain('MGA');
    expect(totalRows.map((row) => (row[0] as { text: string }).text)).toEqual([
      'Total brut',
      'Remises sur les lignes',
      'Sous-total',
      'Remise sur le total',
      'Net à payer',
      'Total des remises',
    ]);
    expect(notice[0]?.[0]).toMatchObject({
      text: 'Devis — valable jusqu’au 03/10/2026 — ne vaut pas facture',
    });
  });

  it('prints the amount due alone without any discount', () => {
    const quote = sampleQuote();
    const plain: Quote = {
      ...quote,
      lines: [quote.lines[1]!],
      grossTotal: '19500.00',
      lineDiscounts: '0.00',
      subtotal: '19500.00',
      orderDiscount: '0.00',
      discountTotal: '0.00',
      total: '19500.00',
    };
    const { totalRows } = parts(plain);
    expect(totalRows).toHaveLength(1);
    expect(totalRows[0]![1]).toMatchObject({ text: formatMga('19500') });
  });

  it('heads the page with the legal mentions filled in, never the app name', () => {
    const doc = quoteDocument(sampleQuote(), context);
    const header = JSON.stringify(doc.content);
    expect(header).toContain('Quincaillerie Rasoa');
    expect(header).toContain('NIF 1234567890');
    expect(header).not.toContain('STAT');
    expect(header).not.toMatch(/vente web/i);
  });

  it('renders an A4 PDF with the fonts embedded', async () => {
    const pdf = await renderPdf(quoteDocument(sampleQuote(), context));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });
});
