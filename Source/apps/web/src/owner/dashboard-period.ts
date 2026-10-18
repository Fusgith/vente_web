import { SHOP_TIME_ZONE, type DashboardQuery } from '@vente-web/shared';

/** The periods offered at a touch (RG-DSH-01); « free » takes two dates. */
export const PRESETS = ['today', 'yesterday', 'week', 'month', 'free'] as const;
export type Preset = (typeof PRESETS)[number];

/** Today at the shop, as a date field holds it (`AAAA-MM-JJ`), whatever the device's zone. */
export const shopToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TIME_ZONE }).format(now);

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The days of a preset up to `today`: the week starts on Monday, the month on the 1st. */
export function periodOf(preset: Exclude<Preset, 'free'>, today: string): DashboardQuery {
  if (preset === 'yesterday') {
    const day = addDays(today, -1);
    return { from: day, to: day };
  }
  if (preset === 'week') {
    const monday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    return { from: addDays(today, -monday), to: today };
  }
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
  return { from: today, to: today };
}

const PERCENT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});
const SHARE = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

/** `+12 %` from `before` to `now` (RG-DSH-04); none against nothing. */
export function variation(now: string | number, before: string | number): string | null {
  const base = Number(before);
  return base === 0 ? null : PERCENT.format((Number(now) - base) / base);
}

/** The discounts' share of the gross sales (RG-DSH-01). */
export function share(part: string, whole: string): string | null {
  const base = Number(whole);
  return base === 0 ? null : SHARE.format(Number(part) / base);
}
