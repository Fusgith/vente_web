import { describe, expect, it } from 'vitest';

import { invoiceNumber, vatBreakdown } from './invoices.js';

describe('invoice number (RG-FAC-01)', () => {
  it('pads the yearly sequence on six digits', () => {
    expect(invoiceNumber('F', 2026, 1)).toBe('F-2026-000001');
    expect(invoiceNumber('FAC', 2027, 123456)).toBe('FAC-2027-123456');
  });
});

describe('VAT inside VAT-inclusive prices (RG-FAC-03)', () => {
  it('splits the amount due into base and VAT, to the cent', () => {
    expect(vatBreakdown('120000.00', '20')).toEqual({
      base: '100000.00',
      vat: '20000.00',
      total: '120000.00',
    });
    // 65 000 / 1,2 = 54 166,666… → 54 166,67; the VAT takes the rest.
    expect(vatBreakdown('65000.00', '20')).toEqual({
      base: '54166.67',
      vat: '10833.33',
      total: '65000.00',
    });
    expect(vatBreakdown('100.00', '0')).toMatchObject({ base: '100.00', vat: '0.00' });
  });
});
