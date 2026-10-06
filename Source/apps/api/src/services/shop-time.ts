/**
 * The shop's clock. The server speaks UTC (see `db.ts`), but a year or a day belongs to the shop:
 * Madagascar, UTC+3 without daylight saving. A quote typed on 1 January at 00:30 is of the new
 * year, although it is still 31 December in UTC.
 */
export const SHOP_TIME_ZONE = 'Indian/Antananarivo';

const yearFormat = new Intl.DateTimeFormat('en', { timeZone: SHOP_TIME_ZONE, year: 'numeric' });
const clockFormat = new Intl.DateTimeFormat('en', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});

interface ShopClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What the shop's wall clock reads at an instant. */
function shopClock(at: Date): ShopClock {
  const parts = clockFormat.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Calendar arithmetic on the shop's day, in UTC where no day is ever skipped or doubled. */
function shopDay(at: Date, days: number): Date {
  const { year, month, day } = shopClock(at);
  return new Date(Date.UTC(year, month - 1, day + days));
}

export function shopYear(at: Date): number {
  return Number(yearFormat.format(at));
}

/** The shop's calendar day of an instant, `days` later, as printed: « 03/10/2026 ». */
export function shopDate(at: Date, days = 0): string {
  const day = shopDay(at, days);
  return `${pad(day.getUTCDate())}/${pad(day.getUTCMonth() + 1)}/${day.getUTCFullYear()}`;
}

/** The shop's calendar day as a `date` column holds it: midnight UTC of that day (RG-TKT-01). */
export function shopDateValue(at: Date): Date {
  return shopDay(at, 0);
}

/** The instant the shop's day of `at` starts (00:00 at the shop), `days` later. */
export function shopDayStart(at: Date, days = 0): Date {
  const clock = shopClock(at);
  const wall = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  const offset = wall - Math.floor(at.getTime() / 1000) * 1000;
  return new Date(Date.UTC(clock.year, clock.month - 1, clock.day + days) - offset);
}

/** `HH:MM` on the 24-hour clock, as the `day_end_time` setting holds it. */
export const CLOCK_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The first instant after `now` at which the shop's clock reads `time` (`HH:MM`): today's if it
 * is still ahead, tomorrow's otherwise — `days` later still. Serves the day end of reservations
 * (RG-STK-02): validated on Monday with a duration of 2 days, an order runs until Wednesday's.
 */
export function nextShopTime(now: Date, time: string, days = 0): Date {
  const match = CLOCK_TIME.exec(time);
  if (!match) throw new RangeError(`Not a clock time: "${time}"`);
  const clock = shopClock(now);
  // The zone's offset at `now`, whole seconds: the wall clock minus the instant.
  const wall = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  const at = (days: number) =>
    new Date(
      Date.UTC(clock.year, clock.month - 1, clock.day + days, Number(match[1]), Number(match[2])) -
        offset,
    );
  return at(at(0).getTime() > now.getTime() ? days : days + 1);
}
