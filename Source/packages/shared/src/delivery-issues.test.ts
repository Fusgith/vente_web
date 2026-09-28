import { describe, expect, it } from 'vitest';

import { creditedAmount, deliveryIssueReportSchema } from './delivery-issues.js';

describe('creditedAmount (RG-ANN-03, H37)', () => {
  it('credits what was paid for the part not handed over', () => {
    // 3 packs paid 47 500,00 after both discounts, 1 missing.
    expect(creditedAmount({ qty: '3', paid: '47500.00', missing: '1' })).toBe('15833.33');
    expect(creditedAmount({ qty: '2', paid: '47500.00', missing: '1' })).toBe('23750.00');
  });

  it('rounds half-up to the cent', () => {
    expect(creditedAmount({ qty: '3', paid: '0.05', missing: '1' })).toBe('0.02');
    expect(creditedAmount({ qty: '4', paid: '0.10', missing: '1' })).toBe('0.03');
  });

  it('credits the whole line exactly when nothing of it was handed over', () => {
    expect(creditedAmount({ qty: '3', paid: '100.00', missing: '3' })).toBe('100.00');
    expect(creditedAmount({ qty: '2.5', paid: '12500.00', missing: '2.5' })).toBe('12500.00');
  });

  it('credits nothing for nothing missing', () => {
    expect(creditedAmount({ qty: '3', paid: '100.00', missing: '0' })).toBe('0.00');
  });
});

describe('deliveryIssueReportSchema', () => {
  const line = { position: 1, qty: '1', cause: 'MISSING' };

  it('takes each line once, with a quantity and a cause', () => {
    expect(
      deliveryIssueReportSchema.safeParse({ version: 3, lines: [line], note: '' }).data,
    ).toEqual({ version: 3, lines: [line], note: null });
    expect(
      deliveryIssueReportSchema.safeParse({ version: 3, lines: [line, line], note: null }).success,
    ).toBe(false);
    expect(
      deliveryIssueReportSchema.safeParse({
        version: 3,
        lines: [{ ...line, qty: '0' }],
        note: null,
      }).success,
    ).toBe(false);
    expect(
      deliveryIssueReportSchema.safeParse({
        version: 3,
        lines: [{ ...line, cause: 'LOST' }],
        note: null,
      }).success,
    ).toBe(false);
  });
});
