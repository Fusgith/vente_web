/**
 * Exact arithmetic on decimal strings (RG-FMT-01): quantities and amounts carry 2 decimals and
 * are never handled as floats. The discount engine (T-031) builds on these.
 */
import { roundHalfUp } from './format.js';

/** Largest whole part typed for a quantity: 6 digits, as in the quick entry « 12*CODE ». */
const QUANTITY_PATTERN = /^\d{1,6}(?:\.\d{1,2})?$/;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/** A quantity a user may enter: positive, at most 6 digits and 2 decimals (RG-ART-04). */
export function isQuantity(value: string): boolean {
  return QUANTITY_PATTERN.test(value) && /[1-9]/.test(value);
}

function toScaled(value: string, scale: number): bigint {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new RangeError(`Not a decimal string: "${value}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.replace(/0+$/, '').length > scale) {
    throw new RangeError(`More than ${scale} decimals: "${value}"`);
  }
  const scaled = BigInt(whole + fraction.padEnd(scale, '0').slice(0, scale));
  return sign === '-' ? -scaled : scaled;
}

function fromScaled(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return scale > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Sum of quantities, trailing zeros dropped: `addQuantities('1.5', '0.5')` → `'2'`. */
export function addQuantities(a: string, b: string): string {
  return fromScaled(toScaled(a, 2) + toScaled(b, 2), 2).replace(/\.?0+$/, '');
}

/** Gross amount of a line: quantity × unit price, rounded half-up to 2 decimals (RG-DEV-05). */
export function lineGross(quantity: string, unitPrice: string): string {
  return roundHalfUp(fromScaled(toScaled(quantity, 2) * toScaled(unitPrice, 2), 4), 2);
}

/** Sum of amounts, without any new rounding (RG-DEV-05): `'0.00'` for none. */
export function sumAmounts(amounts: readonly string[]): string {
  return fromScaled(
    amounts.reduce((total, amount) => total + toScaled(amount, 2), 0n),
    2,
  );
}
