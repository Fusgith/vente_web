/**
 * The shop's clock. The server speaks UTC (see `db.ts`), but a year or a day belongs to the shop:
 * Madagascar, UTC+3 without daylight saving. A quote typed on 1 January at 00:30 is of the new
 * year, although it is still 31 December in UTC.
 */
export const SHOP_TIME_ZONE = 'Indian/Antananarivo';

const yearFormat = new Intl.DateTimeFormat('en', { timeZone: SHOP_TIME_ZONE, year: 'numeric' });

export function shopYear(at: Date): number {
  return Number(yearFormat.format(at));
}
