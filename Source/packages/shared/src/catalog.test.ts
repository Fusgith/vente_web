import { describe, expect, it } from 'vitest';

import {
  parseQuickEntry,
  productSearchQuerySchema,
  productSearchResultSchema,
  searchTokens,
  splitInUnit,
} from './catalog.js';
import { resolveDiscountCap } from './discount.js';

describe('parseQuickEntry (RG-DEV-06 §4)', () => {
  it('reads the quantity typed before the code', () => {
    expect(parseQuickEntry('12*SAV-001')).toEqual({ quantity: '12', term: 'SAV-001' });
    expect(parseQuickEntry(' 12 * SAV-001 ')).toEqual({ quantity: '12', term: 'SAV-001' });
    expect(parseQuickEntry('12 x SAV-001')).toEqual({ quantity: '12', term: 'SAV-001' });
    expect(parseQuickEntry('3 X riz 50')).toEqual({ quantity: '3', term: 'riz 50' });
    expect(parseQuickEntry('2,5×RIZ-001')).toEqual({ quantity: '2.5', term: 'RIZ-001' });
  });

  it('keeps plain text, barcodes and codes that merely contain an x', () => {
    expect(parseQuickEntry('savon')).toEqual({ quantity: null, term: 'savon' });
    expect(parseQuickEntry('3760000000017')).toEqual({ quantity: null, term: '3760000000017' });
    expect(parseQuickEntry('12X40')).toEqual({ quantity: null, term: '12X40' });
    expect(parseQuickEntry('12x SAV-001')).toEqual({ quantity: null, term: '12x SAV-001' });
  });

  it('never turns a zero or over-precise quantity into a line', () => {
    expect(parseQuickEntry('0*SAV-001')).toEqual({ quantity: null, term: '0*SAV-001' });
    expect(parseQuickEntry('1,255*SAV-001').quantity).toBeNull();
    expect(parseQuickEntry('12*').quantity).toBeNull();
  });
});

describe('searchTokens', () => {
  it('splits on anything but letters and digits, accents kept for the database', () => {
    expect(searchTokens('SAV-001')).toEqual(['SAV', '001']);
    expect(searchTokens('  huile  végétale, 1 L ')).toEqual(['huile', 'végétale', '1', 'L']);
    expect(searchTokens('%_*')).toEqual([]);
  });
});

describe('search contracts', () => {
  it('trims the query and refuses an empty one', () => {
    expect(productSearchQuerySchema.parse({ q: '  riz ' })).toEqual({ q: 'riz' });
    expect(productSearchQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(productSearchQuerySchema.safeParse({ q: 'riz', categoryId: 'x' }).success).toBe(false);
  });

  it('never carries more than 8 results', () => {
    const hit = {
      id: '0199a0e0-0000-7000-8000-000000000001',
      sku: 'A',
      name: 'A',
      category: null,
      baseUnit: 'pièce',
      available: '0',
      units: [],
    };
    const result = { exact: null, items: Array.from({ length: 9 }, () => hit), more: true };
    expect(productSearchResultSchema.safeParse(result).success).toBe(false);
  });
});

describe('splitInUnit (RG-STK-01)', () => {
  it('gives whole sale units and the rest in base unit', () => {
    expect(splitInUnit('150', '72')).toEqual({ count: '2', rest: '6' });
    expect(splitInUnit('1250.5', '25')).toEqual({ count: '50', rest: '0.5' });
    expect(splitInUnit('48.75', '1')).toEqual({ count: '48', rest: '0.75' });
    expect(splitInUnit('10', '2.5')).toEqual({ count: '4', rest: '0' });
  });

  it('shows nothing to sell when the stock is empty', () => {
    expect(splitInUnit('0', '12')).toEqual({ count: '0', rest: '0' });
  });

  it('rejects a factor that is not positive', () => {
    expect(() => splitInUnit('10', '0')).toThrow(RangeError);
  });
});

describe('resolveDiscountCap (RG-REM-01)', () => {
  it('takes the first cap set: unit, product, category, then the setting', () => {
    const none = { unit: null, product: null, category: null, fallback: '0' };
    expect(resolveDiscountCap(none)).toBe('0');
    expect(resolveDiscountCap({ ...none, category: '5' })).toBe('5');
    expect(resolveDiscountCap({ ...none, category: '5', product: '15' })).toBe('15');
    expect(resolveDiscountCap({ ...none, category: '5', product: '15', unit: '8' })).toBe('8');
    // An explicit 0 blocks the fallback: the product is not discountable (RG-REM-01).
    expect(resolveDiscountCap({ ...none, category: '5', product: '0' })).toBe('0');
  });
});
