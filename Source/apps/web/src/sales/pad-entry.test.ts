import { describe, expect, it } from 'vitest';

import { entryToQuantity, nextEntry, type PadKey } from './pad-entry.js';

function type(keys: PadKey[], start: string | null = null): string | null {
  return keys.reduce<string | null>((entry, key) => nextEntry(entry, key), start);
}

describe('nextEntry', () => {
  it('replaces the selected quantity with the first key', () => {
    expect(nextEntry(null, '7')).toBe('7');
    expect(type(['1', '2'])).toBe('12');
  });

  it('starts a decimal with 0 and takes one comma only', () => {
    expect(type([','])).toBe('0,');
    expect(type(['2', ',', '5', ','])).toBe('2,5');
  });

  it('drops a leading zero', () => {
    expect(type(['0', '0', '4'])).toBe('4');
  });

  it('stops at 6 digits and 2 decimals', () => {
    expect(type(['9', '9', '9', '9', '9', '9', '9'])).toBe('999999');
    expect(type(['1', ',', '2', '5', '7'])).toBe('1,25');
  });

  it('erases the last character, and the whole selection at once', () => {
    expect(type(['1', '2', 'erase'])).toBe('1');
    expect(nextEntry(null, 'erase')).toBe('');
  });
});

describe('entryToQuantity', () => {
  it('turns the pad text into a quantity', () => {
    expect(entryToQuantity('12')).toBe('12');
    expect(entryToQuantity('2,5')).toBe('2.5');
    expect(entryToQuantity('2,50')).toBe('2.5');
    expect(entryToQuantity('3,')).toBe('3');
  });

  it('refuses nothing, zero and a lone comma', () => {
    for (const entry of ['', '0', '0,', '0,00']) expect(entryToQuantity(entry)).toBeNull();
  });
});
