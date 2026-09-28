import { describe, expect, it } from 'vitest';

import {
  NBSP,
  formatAmount,
  formatDate,
  formatMga,
  formatQty,
  formatTime,
  formatTyped,
  roundHalfUp,
} from './format.js';

describe('roundHalfUp — RG-FMT-01 (arrondi au plus proche, demi-supérieur)', () => {
  it('rounds .5 up, exactly, from decimal strings', () => {
    expect(roundHalfUp('1.005', 2)).toBe('1.01');
    expect(roundHalfUp('1.004', 2)).toBe('1.00');
    expect(roundHalfUp('2.675', 2)).toBe('2.68');
    expect(roundHalfUp('0.5', 0)).toBe('1');
  });

  it('pads and truncates to the requested precision', () => {
    expect(roundHalfUp('7', 2)).toBe('7.00');
    expect(roundHalfUp('7.1', 2)).toBe('7.10');
    expect(roundHalfUp('7.129', 2)).toBe('7.13');
    expect(roundHalfUp(12.5, 3)).toBe('12.500');
  });

  it('handles negatives and never yields -0', () => {
    expect(roundHalfUp('-1.005', 2)).toBe('-1.01');
    expect(roundHalfUp('-0.001', 2)).toBe('0.00');
  });

  it('accepts a comma as decimal separator on input', () => {
    expect(roundHalfUp('3,5', 1)).toBe('3.5');
  });

  it('rejects non-numeric input', () => {
    expect(() => roundHalfUp('abc', 2)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.NaN, 2)).toThrow(RangeError);
  });
});

describe('formatMga — RG-FMT-01', () => {
  it('formats the reference example 1 250 000,00 MGA with NBSP thousands', () => {
    expect(formatMga('1250000')).toBe(`1${NBSP}250${NBSP}000,00${NBSP}MGA`);
  });

  it('always shows two decimals and the MGA sign after the number', () => {
    expect(formatMga(4500)).toBe(`4${NBSP}500,00${NBSP}MGA`);
    expect(formatMga('0')).toBe(`0,00${NBSP}MGA`);
    expect(formatMga('999.999')).toBe(`1${NBSP}000,00${NBSP}MGA`);
  });

  it('formats credit-note style negative amounts', () => {
    expect(formatMga('-25000')).toBe(`-25${NBSP}000,00${NBSP}MGA`);
  });
});

describe('formatAmount — RG-FMT-01 (dans un tableau, le sigle est dans l’en-tête)', () => {
  it('formats the amount as formatMga does, without the sign', () => {
    expect(formatAmount('1250000')).toBe(`1${NBSP}250${NBSP}000,00`);
    expect(formatAmount('999.999')).toBe(`1${NBSP}000,00`);
    expect(formatMga('4500')).toBe(`${formatAmount('4500')}${NBSP}MGA`);
  });
});

describe('formatQty — RG-FMT-01, RG-ART-04 (décimales nulles masquées)', () => {
  it('hides null decimals', () => {
    expect(formatQty('12')).toBe('12');
    expect(formatQty('12.00')).toBe('12');
    expect(formatQty('12.50')).toBe('12,5');
    expect(formatQty('12.25')).toBe('12,25');
  });

  it('uses the same thousands separator as amounts', () => {
    expect(formatQty('1500')).toBe(`1${NBSP}500`);
    expect(formatQty('1500.5')).toBe(`1${NBSP}500,5`);
  });

  it('rounds to two decimals half-up (base_qty = round(qty × factor, 2))', () => {
    expect(formatQty('0.125')).toBe('0,13');
    expect(formatQty('100.001')).toBe('100');
  });
});

describe('formatTyped — RG-FMT-01 (saisie en cours au pavé)', () => {
  it('groups the thousands as they will print, without rounding', () => {
    expect(formatTyped('12350')).toBe(`12${NBSP}350`);
    expect(formatTyped('1250000,5')).toBe(`1${NBSP}250${NBSP}000,5`);
  });

  it('keeps a trailing comma and shows 0 for nothing typed', () => {
    expect(formatTyped('12,')).toBe('12,');
    expect(formatTyped('')).toBe('0');
    expect(formatTyped(',5')).toBe('0,5');
  });
});

describe('formatTime (RG-FMT-03)', () => {
  it('reads the time at the shop, UTC+3', () => {
    expect(formatTime('2026-09-28T05:02:00.000Z')).toBe('08:02');
    expect(formatTime(new Date('2026-09-28T21:30:00.000Z'))).toBe('00:30');
  });
});

describe('formatDate (RG-FMT-03)', () => {
  it('reads the day at the shop, UTC+3', () => {
    expect(formatDate('2026-09-28T05:02:00.000Z')).toBe('28/09/2026');
    expect(formatDate(new Date('2026-12-31T21:30:00.000Z'))).toBe('01/01/2027');
  });
});
