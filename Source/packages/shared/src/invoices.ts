import { z } from 'zod';

import { fromScaled, toScaled } from './decimal.js';

/** An invoice as the screens name it (RG-FAC-01): `F-2026-000123`. */
export const invoiceRefSchema = z.object({ id: z.uuid(), number: z.string() });
export type InvoiceRef = z.infer<typeof invoiceRefSchema>;

/** `<prefix>-<year>-<seq on 6 digits>` (RG-FAC-01, H33). */
export function invoiceNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

export interface VatBreakdown {
  /** Excluding VAT. */
  base: string;
  vat: string;
  /** Including VAT: the amount due. */
  total: string;
}

/**
 * The VAT inside an amount due at VAT-inclusive prices (RG-FAC-03, H33): the base rounded
 * half-up to the cent, the VAT what is left — base + VAT is the amount due to the cent.
 */
export function vatBreakdown(total: string, ratePct: string): VatBreakdown {
  const cents = toScaled(total, 2);
  const rate = toScaled(ratePct, 2);
  const whole = 10_000n + rate;
  const base = (2n * cents * 10_000n + whole) / (2n * whole);
  return {
    base: fromScaled(base, 2),
    vat: fromScaled(cents - base, 2),
    total: fromScaled(cents, 2),
  };
}
