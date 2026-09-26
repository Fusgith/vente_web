import { describe, expect, it } from 'vitest';

import { shopDate, shopYear } from './shop-time.js';

describe('shop time (Indian/Antananarivo, UTC+3)', () => {
  it('takes the day of the shop, not of the server', () => {
    // 22:30 UTC on 30 September is already 1 October in Antananarivo.
    const lateEvening = new Date('2026-09-30T22:30:00Z');
    expect(shopDate(lateEvening)).toBe('01/10/2026');
    expect(shopDate(new Date('2026-09-30T20:59:00Z'))).toBe('30/09/2026');
    expect(shopYear(new Date('2026-12-31T21:00:00Z'))).toBe(2027);
  });

  it('counts days forward across months and years (RG-DEV-02)', () => {
    expect(shopDate(new Date('2026-09-26T09:00:00Z'), 7)).toBe('03/10/2026');
    expect(shopDate(new Date('2026-12-28T09:00:00Z'), 7)).toBe('04/01/2027');
    expect(shopDate(new Date('2028-02-27T09:00:00Z'), 2)).toBe('29/02/2028');
  });
});
