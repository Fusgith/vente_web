/**
 * The shop's clock. The server speaks UTC (see `db.ts`), but a year or a day belongs to the shop:
 * Madagascar, UTC+3 without daylight saving. A quote typed on 1 January at 00:30 is of the new
 * year, although it is still 31 December in UTC.
 */
export const SHOP_TIME_ZONE = 'Indian/Antananarivo';

const yearFormat = new Intl.DateTimeFormat('en', { timeZone: SHOP_TIME_ZONE, year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('en', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

export function shopYear(at: Date): number {
  return Number(yearFormat.format(at));
}

/** The shop's calendar day of an instant, `days` later, as printed: « 03/10/2026 ». */
export function shopDate(at: Date, days = 0): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(dayFormat.formatToParts(at).find((p) => p.type === type)?.value);
  // Calendar arithmetic on the shop's day, in UTC where no day is ever skipped or doubled.
  const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + days));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(day.getUTCDate())}/${pad(day.getUTCMonth() + 1)}/${day.getUTCFullYear()}`;
}
