import { describe, expect, it } from 'vitest';

import type { CreditNoteSnapshot } from '../../services/credit-notes.js';
import { renderPdf } from '../render.js';
import { creditNoteDocument } from './credit-note.js';

const ID = '00000000-0000-4000-8000-000000000001';

const SNAPSHOT: CreditNoteSnapshot = {
  number: 'AV-2026-000007',
  issuedOn: '28/09/2026',
  issuedAt: '16:40',
  legal: {
    name: 'Épicerie Rasoa',
    address: 'Lot II A 12, Antananarivo 101',
    phone: '034 00 000 00',
    nif: '',
    stat: '',
    rcs: '',
    footer: '',
  },
  invoice: { number: 'F-2026-000123', issuedOn: '28/09/2026' },
  order: { number: 'D-2026-000042', ticket: 'A15' },
  customer: { name: 'Rasoa Hanta', phone: '0341122233' },
  lines: [
    {
      position: 1,
      productId: ID,
      productUnitId: ID,
      sku: 'CLO-001',
      name: 'Clous 70 mm',
      unitLabel: 'kg',
      factor: '1',
      baseUnit: 'kg',
      qty: '2',
      unitPrice: '6500.00',
      capPct: '15',
      gross: '13000.00',
      discountPct: '0.00',
      discountAmount: '0.00',
      discountSource: 'NONE',
      net: '13000.00',
    },
  ],
  totals: {
    grossTotal: '13000.00',
    lineDiscounts: '0.00',
    subtotal: '13000.00',
    orderDiscountPct: null,
    orderDiscount: '0.00',
    discountTotal: '0.00',
    total: '13000.00',
  },
  amount: '13000.00',
  reason: 'Le client renonce',
  refund: { method: 'MVola', reference: 'MP240928', amount: '13000.00' },
  cashier: 'Soa Caissière',
  approvedBy: 'Rakoto Responsable',
};

function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === 'object') return Object.values(node).flatMap(texts);
  return [];
}

describe('credit note PDF (RG-FAC-05, H36)', () => {
  it('prints the invoice it credits, who validated it, why, and how it was refunded', () => {
    const all = texts(creditNoteDocument(SNAPSHOT).content).map((value) =>
      value.replace(/\s/g, ' '),
    );
    expect(all).toEqual(
      expect.arrayContaining([
        'Avoir',
        'AV-2026-000007',
        'F-2026-000123 (28/09/2026)',
        'Rakoto Responsable',
        'Le client renonce',
        'Total de la facture',
        '13 000,00 MGA',
      ]),
    );
    expect(all.join('|')).toContain('réf. MP240928');
    // A credit note owes nothing: never "Net à payer".
    expect(all).not.toContain('Net à payer');
  });

  it('renders to a PDF', async () => {
    const pdf = await renderPdf(creditNoteDocument(SNAPSHOT));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
