import { describe, expect, it } from 'vitest';

import { paymentLineInputSchema, settle } from './payments.js';

const cash = (amount: string) => ({ amount, cash: true });
const other = (amount: string) => ({ amount, cash: false });

describe('settle (RG-PAY-02/03)', () => {
  it('gives change on the cash handed over', () => {
    expect(settle('112500.00', [cash('112500.00')], '120000')).toEqual({
      paid: '112500.00',
      remaining: '0.00',
      cashPart: '112500.00',
      cashReceived: '120000.00',
      change: '7500.00',
      issue: null,
    });
    // Nothing typed: exactly the cash part, no change.
    expect(settle('500', [cash('500')], null)).toMatchObject({ change: '0.00', issue: null });
  });

  it('adds the lines of a mixed payment up to the amount due exactly', () => {
    expect(settle('112500.00', [other('100000'), cash('12500')], '20000')).toMatchObject({
      cashPart: '12500.00',
      change: '7500.00',
      issue: null,
    });
    expect(settle('112500.00', [other('100000')], null)).toMatchObject({
      remaining: '12500.00',
      issue: 'TOTAL_MISMATCH',
    });
    expect(settle('100.00', [other('150')], null)).toMatchObject({
      remaining: '-50.00',
      issue: 'TOTAL_MISMATCH',
    });
  });

  it('refuses short cash, two cash lines, cash received without a cash line', () => {
    expect(settle('100', [cash('100')], '90').issue).toBe('CASH_SHORT');
    expect(settle('100', [cash('50'), cash('50')], null).issue).toBe('CASH_TWICE');
    expect(settle('100', [other('100')], '100').issue).toBe('CASH_WITHOUT_LINE');
    expect(settle('100', [other('100')], '0').issue).toBeNull();
  });
});

describe('payment line input', () => {
  const line = { methodId: '0192a4f0-0000-7000-8000-000000000001', amount: '100' };
  it('trims the reference, an empty one being none', () => {
    expect(paymentLineInputSchema.parse({ ...line, reference: '  MP2409 ' }).reference).toBe(
      'MP2409',
    );
    expect(paymentLineInputSchema.parse({ ...line, reference: '  ' }).reference).toBeNull();
  });
  it('refuses a zero or negative amount', () => {
    expect(
      paymentLineInputSchema.safeParse({ ...line, amount: '0', reference: null }).success,
    ).toBe(false);
    expect(
      paymentLineInputSchema.safeParse({ ...line, amount: '-5', reference: null }).success,
    ).toBe(false);
  });
});
