import { describe, expect, it } from 'vitest';

import { addQuantities, baseQuantity, isQuantity, lineGross, sumAmounts } from './decimal.js';

describe('isQuantity (RG-ART-04)', () => {
  it('accepts positive quantities with at most 2 decimals', () => {
    for (const value of ['1', '12', '0.5', '12.25', '999999.99']) {
      expect(isQuantity(value), value).toBe(true);
    }
  });

  it('refuses zero, negatives, too many digits and commas', () => {
    for (const value of ['0', '0.00', '-1', '1.234', '1000000', '12,5', '', '.5']) {
      expect(isQuantity(value), value).toBe(false);
    }
  });
});

describe('addQuantities', () => {
  it('adds exactly and drops trailing zeros', () => {
    expect(addQuantities('1', '1')).toBe('2');
    expect(addQuantities('0.1', '0.2')).toBe('0.3');
    expect(addQuantities('1.5', '0.5')).toBe('2');
    expect(addQuantities('12.25', '0.05')).toBe('12.3');
  });
});

describe('baseQuantity (RG-ART-06)', () => {
  it('converts a sale quantity into base unit, rounded half-up once', () => {
    expect(baseQuantity('2', '12')).toBe('24.00');
    expect(baseQuantity('1.5', '0.25')).toBe('0.38');
    expect(baseQuantity('3', '0.333')).toBe('1.00');
  });
});

describe('lineGross (RG-DEV-05)', () => {
  it('multiplies exactly and rounds half-up once', () => {
    expect(lineGross('3', '4500')).toBe('13500.00');
    expect(lineGross('0.1', '0.3')).toBe('0.03');
    expect(lineGross('2.5', '0.15')).toBe('0.38');
    expect(lineGross('999999.99', '280000')).toBe('279999997200.00');
  });

  it('refuses a price with more than 2 decimals', () => {
    expect(() => lineGross('1', '0.125')).toThrow(RangeError);
  });
});

describe('sumAmounts', () => {
  it('sums without rounding again', () => {
    expect(sumAmounts([])).toBe('0.00');
    expect(sumAmounts(['0.38', '13500.00', '0.1'])).toBe('13500.48');
  });
});
