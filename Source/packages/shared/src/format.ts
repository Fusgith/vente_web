/**
 * Display formats (RG-FMT-01). Every amount or quantity shown to a user goes
 * through these functions; no local reformatting anywhere else (03-cdc-agent-ia §6.1).
 *
 * Values are handled as decimal strings so that rounding is exact: money and
 * quantities come from PostgreSQL NUMERIC columns as strings, never as floats.
 */

/** Non-breaking space: thousands separator required by RG-FMT-01. */
export const NBSP = '\u00A0';

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

function toDecimalString(value: number | string): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
    // toFixed(10) avoids exponent notation for large/small magnitudes.
    return value.toFixed(10);
  }
  const trimmed = value.trim().replace(',', '.');
  if (!DECIMAL_PATTERN.test(trimmed)) throw new RangeError(`Not a decimal string: "${value}"`);
  return trimmed;
}

/**
 * Round half-up ("arrondi au plus proche, demi-supérieur", RG-FMT-01) to `decimals`
 * places, using integer arithmetic so 1.005 → 1.01 (a float-based round would give 1.00).
 * Returns a plain decimal string with exactly `decimals` fraction digits.
 */
export function roundHalfUp(value: number | string, decimals: number): string {
  const match = DECIMAL_PATTERN.exec(toDecimalString(value));
  if (!match) throw new RangeError(`Not a decimal: "${value}"`);
  const [, sign, intPart, fracPart = ''] = match;
  const fraction = (fracPart + '0'.repeat(decimals + 1)).slice(0, decimals + 1);
  let scaled = BigInt(intPart + fraction.slice(0, decimals));
  if (fraction.charCodeAt(decimals) >= 53 /* '5' */) scaled += 1n;
  const digits = scaled.toString().padStart(decimals + 1, '0');
  const head = digits.slice(0, digits.length - decimals);
  const tail = digits.slice(digits.length - decimals);
  const body = decimals > 0 ? `${head}.${tail}` : head;
  // Never display "-0,00".
  return sign === '-' && scaled !== 0n ? `-${body}` : body;
}

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** `1234567.891` → `1 234 567,89` (comma decimal, NBSP thousands, 2 decimals). */
function formatDecimal(value: number | string, decimals: number): string {
  const rounded = roundHalfUp(value, decimals);
  const negative = rounded.startsWith('-');
  const [intPart = '0', fracPart] = (negative ? rounded.slice(1) : rounded).split('.');
  const grouped = groupThousands(intPart);
  const body = fracPart === undefined ? grouped : `${grouped},${fracPart}`;
  return negative ? `-${body}` : body;
}

/** Amount in Ariary with the ISO 4217 sign: `1 250 000,00 MGA`, never "Ar" (RG-FMT-01). */
export function formatMga(value: number | string): string {
  return `${formatDecimal(value, 2)}${NBSP}MGA`;
}

/**
 * Digits being typed on a pad, grouped the same way as they will print: `12350,5` →
 * `12 350,5`; a trailing comma stays, the entry is not rounded (RG-FMT-01).
 */
export function formatTyped(text: string): string {
  const [head = '', tail] = text.split(',');
  const grouped = groupThousands(head || '0');
  return tail === undefined ? grouped : `${grouped},${tail}`;
}

/**
 * Quantity: same thousands separator, up to 2 decimals, null decimals hidden
 * (`12` not `12,00`, `12,5` not `12,50`) — RG-FMT-01, RG-ART-04.
 */
export function formatQty(value: number | string): string {
  // formatDecimal always ends with ",dd": drop ",00", then a single trailing zero.
  return formatDecimal(value, 2)
    .replace(/,00$/, '')
    .replace(/(,\d)0$/, '$1');
}
