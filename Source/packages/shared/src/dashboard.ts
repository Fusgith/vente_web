import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount = z.string().regex(/^-?\d+\.\d{2}$/);
const count = z.number().int().nonnegative();

/** A year at most: the dashboard reads every invoice of the period (RG-DSH-01). */
export const DASHBOARD_MAX_DAYS = 366;

/** Shop days, both included (RG-DSH-01: a day, a week, a month or a free period). */
export const dashboardQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine(({ from, to }) => from <= to, { path: ['to'] })
  .refine(({ from, to }) => Date.parse(to) - Date.parse(from) < DASHBOARD_MAX_DAYS * 86_400_000, {
    path: ['to'],
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

/** The figures compared from one period to another (RG-DSH-01/04). */
export const dashboardFiguresSchema = z.object({
  /** The payments received, all methods (RG-PAY-02). */
  collected: amount,
  invoices: count,
  /** Sales ÷ invoices; 0 without any. */
  averageBasket: amount,
  /** The invoices' totals. */
  sales: amount,
  /** Before any discount. */
  gross: amount,
  discounts: amount,
  discountsWithinCap: amount,
  discountsByRule: amount,
  discountsByCode: amount,
  creditNotes: count,
  refunded: amount,
});
export type DashboardFigures = z.infer<typeof dashboardFiguresSchema>;

const unitQty = z.object({ unit: z.string(), qty: amount });

export const dashboardSchema = z.object({
  from: isoDate,
  to: isoDate,
  current: dashboardFiguresSchema,
  /** The period just before: the day before, the week before, the month before (RG-DSH-04). */
  previous: dashboardFiguresSchema,
  /** The same days a week earlier: the same weekday for a single day (RG-DSH-04). */
  weekBefore: dashboardFiguresSchema,
  byMethod: z.array(z.object({ label: z.string(), amount })),
  bySalesperson: z.array(z.object({ name: z.string(), invoices: count, sales: amount })),
  /** Hours of the shop's day that saw an invoice. */
  byHour: z.array(
    z.object({ hour: z.number().int().min(0).max(23), invoices: count, sales: amount }),
  ),
  byDay: z.array(z.object({ date: isoDate, invoices: count, sales: amount })),
  /** Net of every discount, before VAT; « Sans catégorie » under an empty name. */
  byCategory: z.array(z.object({ name: z.string(), sales: amount })),
  /** The 20 best sellers, with what is left to sell (RG-DSH-03). */
  topProducts: z.array(
    z.object({
      sku: z.string(),
      name: z.string(),
      baseUnit: z.string(),
      baseQty: amount,
      units: z.array(unitQty),
      sales: amount,
      available: amount,
    }),
  ),
  /** The prices changed in the period, latest first (RG-DSH-03, RG-ART-07). */
  priceChanges: z.array(
    z.object({
      at: z.string(),
      sku: z.string(),
      name: z.string(),
      unit: z.string(),
      before: amount,
      after: amount,
      source: z.enum(['IMPORT', 'MANUAL']),
      by: z.string(),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
