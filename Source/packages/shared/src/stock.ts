/**
 * Stock adjustments and alerts (RG-STK-05 à 07). Quantities are decimal strings with a dot, in
 * base unit unless said otherwise (RG-STK-01).
 */
import { z } from 'zod';

import { isQuantity } from './decimal.js';

const uuid = z.uuid();
const decimalString = z.string().regex(/^-?\d+\.\d{2}$/);

/** At most this many characters in the free comment of an adjustment. */
export const ADJUSTMENT_NOTE_MAX = 500;

/**
 * A manual adjustment by the manager (RG-STK-05): goods out (breakage, theft…) or in (a count
 * found more), typed in one of the product's units; the reason is one of `adjustment_reasons`.
 */
export const stockAdjustmentSchema = z.object({
  direction: z.enum(['out', 'in']),
  qty: z.string().refine(isQuantity),
  productUnitId: uuid,
  reason: z.string().trim().min(1).max(60),
  note: z.string().trim().max(ADJUSTMENT_NOTE_MAX).nullable(),
});
export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;

/** Where a product's stock stands, with what the adjustment screen offers. */
export const productStockSchema = z.object({
  productId: uuid,
  onHand: decimalString,
  reserved: decimalString,
  available: decimalString,
  /** Null or zero: no alert for this product (RG-STK-07). */
  alertThreshold: decimalString.nullable(),
  /** Active sale units, smallest factor first. */
  units: z.array(z.object({ id: uuid, label: z.string(), factor: z.string() })),
  reasons: z.array(z.string()),
});
export type ProductStock = z.infer<typeof productStockSchema>;

/** A product whose available stock is at or under its alert threshold (RG-STK-07). */
export const stockAlertSchema = z.object({
  productId: uuid,
  sku: z.string(),
  name: z.string(),
  baseUnit: z.string(),
  available: decimalString,
  alertThreshold: decimalString,
});
export type StockAlert = z.infer<typeof stockAlertSchema>;

export const stockAlertsSchema = z.object({ items: z.array(stockAlertSchema) });
export type StockAlerts = z.infer<typeof stockAlertsSchema>;

/**
 * Details of ADJUSTMENT_TOO_LARGE: at most the available stock goes out, so that the stock
 * never turns negative (RG-STK-06) and the goods of validated orders stay theirs (⚠️ H39).
 */
export interface AdjustmentTooLarge {
  available: string;
  baseUnit: string;
}
