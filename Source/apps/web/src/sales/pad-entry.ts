import { addQuantities, isQuantity } from '@vente-web/shared';

/** Phone order (1 2 3 on top), as the shared `Keypad` shows them. */
export const PAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type PadKey = (typeof PAD_DIGITS)[number] | '0' | ',' | 'erase';

/** Up to 6 digits, a comma, up to 2 decimals (RG-ART-04), as typed on the pad. */
const ENTRY_PATTERN = /^\d{0,6}(?:,\d{0,2})?$/;

/**
 * The pad's text after a key. `current` is null while the line's quantity is shown selected:
 * the first key then replaces it, as a selected field would.
 */
export function nextEntry(current: string | null, key: PadKey): string {
  const base = current ?? '';
  if (key === 'erase') return base.slice(0, -1);
  if (key === ',') return base.includes(',') ? base : `${base || '0'},`;
  const candidate = base === '0' ? key : base + key;
  return ENTRY_PATTERN.test(candidate) ? candidate : base;
}

/** The quantity typed (« 12,5 » → `'12.5'`), or null when it is not a valid quantity. */
export function entryToQuantity(entry: string): string | null {
  const value = entry.replace(',', '.').replace(/\.$/, '');
  return isQuantity(value) ? addQuantities(value, '0') : null;
}
