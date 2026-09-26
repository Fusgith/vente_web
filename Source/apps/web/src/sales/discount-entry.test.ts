import { describe, expect, it } from 'vitest';

import type { DraftLine } from './draft.js';
import {
  discountText,
  measureLine,
  nextDiscountText,
  textToDiscount,
  type DiscountKind,
} from './discount-entry.js';
import type { PadKey } from './pad-entry.js';
import { SAVON } from './test-hits.js';

function type(keys: PadKey[], kind: DiscountKind, start = ''): string {
  return keys.reduce((text, key) => nextDiscountText(text, key, kind), start);
}

describe('nextDiscountText (RG-REM-06)', () => {
  it('types a rate with 2 decimals, never beyond 100 %', () => {
    expect(type(['2', ',', '5', '5', '5'], 'pct')).toBe('2,55');
    expect(type(['1', '0', '0'], 'pct')).toBe('100');
    expect(type(['1', '0', '1'], 'pct')).toBe('10');
    expect(type(['9', '9', ',', '9'], 'pct')).toBe('99,9');
  });

  it('types an amount in MGA, the leading zero dropped', () => {
    expect(type(['0', '7', '5', '0'], 'amount')).toBe('750');
    expect(type([',', '5'], 'amount')).toBe('0,5');
    expect(type(['erase'], 'amount', '750')).toBe('75');
  });
});

describe('textToDiscount and back', () => {
  it('reads the text typed; nothing or zero is no discount', () => {
    expect(textToDiscount('2,5', 'pct')).toEqual({ kind: 'pct', value: '2.5' });
    expect(textToDiscount('750,', 'amount')).toEqual({ kind: 'amount', value: '750' });
    expect(textToDiscount('', 'pct')).toBeNull();
    expect(textToDiscount('0,00', 'amount')).toBeNull();
  });

  it('shows a stored discount without its null decimals', () => {
    expect(discountText({ kind: 'pct', value: '2.50' })).toBe('2,5');
    expect(discountText({ kind: 'amount', value: '750.00' })).toBe('750');
    expect(discountText(null)).toBe('');
  });
});

describe('measureLine', () => {
  const [PIECE] = SAVON.units;
  const line: DraftLine = {
    key: 'savon',
    product: SAVON,
    unit: { ...PIECE!, price: '1500' },
    qty: '3',
    capPct: '5',
    discount: null,
  };

  it('bounds the discount by the cap on the gross of the quantity (RG-REM-02)', () => {
    expect(measureLine(line, '3', { kind: 'amount', value: '225' })).toMatchObject({
      maxDiscount: '225.00',
      withinLimit: true,
    });
    expect(measureLine(line, '3', { kind: 'pct', value: '5.01' }).withinLimit).toBe(false);
    // Fewer pieces, a smaller maximum: the same amount no longer fits.
    expect(measureLine(line, '2', { kind: 'amount', value: '225' }).withinLimit).toBe(false);
  });
});
