import { describe, expect, it } from 'vitest';

import { nextShopTime, shopDate, shopDateValue, shopYear } from './shop-time.js';

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

  it('stores the shop day as a date column holds it (RG-TKT-01)', () => {
    expect(shopDateValue(new Date('2026-09-30T22:30:00Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    expect(shopDateValue(new Date('2026-09-30T20:59:59Z')).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
  });

  it('finds the next day end on the shop clock (RG-STK-02)', () => {
    // 10:00 in Antananarivo: the day end is tonight, 23:59 local = 20:59 UTC.
    expect(nextShopTime(new Date('2026-09-26T07:00:00Z'), '23:59').toISOString()).toBe(
      '2026-09-26T20:59:00.000Z',
    );
    // 23:30 local on 30 September is 20:30 UTC: still the same evening.
    expect(nextShopTime(new Date('2026-09-30T20:30:00Z'), '23:59').toISOString()).toBe(
      '2026-09-30T20:59:00.000Z',
    );
    // 00:30 local on 1 October is still 30 September in UTC: the day end is that of 1 October.
    expect(nextShopTime(new Date('2026-09-30T21:30:00Z'), '23:59').toISOString()).toBe(
      '2026-10-01T20:59:00.000Z',
    );
  });

  it('moves to the next day once the day end has passed (⚠️ H28)', () => {
    // 19:00 local with a day end at 18:00: tomorrow 18:00, never an instant already gone.
    expect(nextShopTime(new Date('2026-09-26T16:00:00Z'), '18:00').toISOString()).toBe(
      '2026-09-27T15:00:00.000Z',
    );
    expect(nextShopTime(new Date('2026-09-26T15:00:00Z'), '18:00').toISOString()).toBe(
      '2026-09-27T15:00:00.000Z',
    );
    expect(nextShopTime(new Date('2026-12-31T20:00:00Z'), '23:00').toISOString()).toBe(
      '2027-01-01T20:00:00.000Z',
    );
    expect(() => nextShopTime(new Date(), '24:00')).toThrow(RangeError);
  });
});
