import type { ContentColumns } from 'pdfmake/interfaces.js';
import { describe, expect, it } from 'vitest';

import type { InvoiceSnapshot } from '../../services/invoices.js';
import { renderPdf } from '../render.js';
import { invoiceDocument } from './invoice.js';

const ID = '00000000-0000-4000-8000-000000000001';

function snapshot(overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
  return {
    number: 'F-2026-000123',
    issuedOn: '28/09/2026',
    issuedAt: '10:20',
    legal: {
      name: 'Épicerie Rasoa',
      address: 'Lot II A 12, Antananarivo 101',
      phone: '034 00 000 00',
      nif: '1234567890',
      stat: '',
      rcs: '',
      footer: 'Merci de votre visite',
    },
    order: { number: 'D-2026-000042', ticket: 'A15' },
    salesUser: 'Vola Rakoto',
    cashier: 'Soa Caissière',
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
        qty: '10',
        unitPrice: '6500.00',
        capPct: '15',
        gross: '65000.00',
        discountPct: '0.00',
        discountAmount: '0.00',
        discountSource: 'NONE',
        net: '65000.00',
      },
    ],
    totals: {
      grossTotal: '65000.00',
      lineDiscounts: '0.00',
      subtotal: '65000.00',
      orderDiscountPct: null,
      orderDiscount: '0.00',
      discountTotal: '0.00',
      total: '65000.00',
    },
    discountCode: null,
    discountGranted: false,
    vat: null,
    vatNotice: '',
    payment: {
      lines: [
        { method: 'MVola', reference: 'MP240928', amount: '60000.00' },
        { method: 'Espèces', reference: null, amount: '5000.00' },
      ],
      cashReceived: '10000.00',
      change: '5000.00',
    },
    ...overrides,
  };
}

/** Every text of a document definition, flattened, as read on paper. */
function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === 'object') return Object.values(node).flatMap(texts);
  return [];
}

describe('invoice PDF (RG-FAC-02, H33)', () => {
  it('prints the frozen content: number, ticket, people, payment, change', () => {
    const doc = invoiceDocument(snapshot());
    const header = (doc.content as unknown[])[0] as ContentColumns;
    expect(texts(header)).toEqual(
      expect.arrayContaining([
        'Épicerie Rasoa',
        'NIF 1234567890',
        'Facture',
        'F-2026-000123',
        'A15',
        'Soa Caissière',
      ]),
    );
    const all = texts(doc.content).join('|').replace(/\s/g, ' ');
    expect(all).toContain('réf. MP240928');
    expect(all).toMatch(/Rendu\|[^|]*\|5 000,00 MGA/);
    expect(all).not.toContain('TVA');
  });

  it('breaks the VAT down before the amount due, or prints the notice', () => {
    const vat = texts(
      invoiceDocument(snapshot({ vat: { rate: '20', base: '54166.67', vat: '10833.33' } })).content,
    ).map((value) => value.replace(/\s/g, ' '));
    const at = (value: string) => vat.indexOf(value);
    expect(at('Total HT')).toBeGreaterThan(0);
    expect(at('54 166,67 MGA')).toBeGreaterThan(at('Total HT'));
    expect(at('TVA 20 %')).toBeGreaterThan(at('54 166,67 MGA'));
    expect(at('10 833,33 MGA')).toBeGreaterThan(at('TVA 20 %'));
    expect(at('Net à payer')).toBeGreaterThan(at('10 833,33 MGA'));
    const notice = texts(invoiceDocument(snapshot({ vatNotice: 'TVA non applicable' })).content);
    expect(notice).toContain('TVA non applicable');
  });

  it('names the promo code under which discounts went beyond the caps (RG-REM-07, H63)', () => {
    const header = (doc: ReturnType<typeof invoiceDocument>) =>
      texts((doc.content as unknown[])[0]);
    expect(header(invoiceDocument(snapshot()))).not.toContain('Code promo');
    const coded = header(invoiceDocument(snapshot({ discountCode: 'R7K4-29QP' })));
    expect(coded).toEqual(expect.arrayContaining(['Code promo', 'R7K4-29QP']));
  });

  it('prints the owner’s answer to a request without its code (H64)', () => {
    const header = texts(
      (
        invoiceDocument(snapshot({ discountCode: 'R7K4-29QP', discountGranted: true }))
          .content as unknown[]
      )[0],
    );
    expect(header).toEqual(expect.arrayContaining(['Remise', 'Accordée par le boss']));
    expect(header).not.toContain('R7K4-29QP');
    expect(header).not.toContain('Code promo');
  });

  it('renders to a PDF', async () => {
    const pdf = await renderPdf(invoiceDocument(snapshot()));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
