import {
  computeQuote,
  type DiscountEntry,
  type QuoteInput,
  type QuoteLineTotals,
} from '@vente-web/shared';

import type { DraftLine, DraftState } from './draft.js';
import type { PadKey } from './pad-entry.js';

export type DiscountKind = DiscountEntry['kind'];

/** A rate or an amount in MGA, both with up to 2 decimals (RG-REM-06). */
const PATTERN: Record<DiscountKind, RegExp> = {
  pct: /^\d{0,3}(?:,\d{0,2})?$/,
  amount: /^\d{0,12}(?:,\d{0,2})?$/,
};

const toValue = (text: string) => text.replace(',', '.').replace(/\.$/, '');

/** The discount's text after a key, as `nextEntry` types a quantity; a rate never passes 100. */
export function nextDiscountText(current: string, key: PadKey, kind: DiscountKind): string {
  if (key === 'erase') return current.slice(0, -1);
  if (key === ',') return current.includes(',') ? current : `${current || '0'},`;
  const candidate = current === '0' ? key : current + key;
  if (!PATTERN[kind].test(candidate)) return current;
  return kind === 'pct' && Number(toValue(candidate)) > 100 ? current : candidate;
}

/** The discount typed, or null for none: nothing typed, or zero. */
export function textToDiscount(text: string, kind: DiscountKind): DiscountEntry | null {
  const value = toValue(text);
  return /[1-9]/.test(value) ? { kind, value } : null;
}

/** A discount back to the pad's text: `2.50` → `2,5`, `750.00` → `750`. */
export function discountText(entry: DiscountEntry | null): string {
  if (!entry) return '';
  const [head = '0', tail = ''] = entry.value.split('.');
  const decimals = tail.replace(/0+$/, '');
  return decimals ? `${head},${decimals}` : head;
}

/** The draft as the shared engine reads it (RG-REM-06, RG-DEV-05). */
export function quoteInput(draft: Pick<DraftState, 'lines' | 'orderDiscount' | 'orderGranted'>) {
  return {
    lines: draft.lines.map((line) => ({
      quantity: line.qty,
      unitPrice: line.unit.price,
      capPct: line.capPct,
      suggestedPct: line.suggestedPct ?? null,
      discount: line.discount,
      granted: line.granted ?? null,
    })),
    orderDiscount: draft.orderDiscount,
    orderGranted: draft.orderGranted ?? null,
  } satisfies QuoteInput;
}

/** A line as it would stand with this quantity and discount: its maximum, and whether it fits. */
export function measureLine(
  line: DraftLine,
  qty: string,
  discount: DiscountEntry | null,
): QuoteLineTotals {
  const input = quoteInput({ lines: [{ ...line, qty, discount }], orderDiscount: null });
  return computeQuote(input).lines[0]!;
}
