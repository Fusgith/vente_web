import type { DiscountEntry } from '@vente-web/shared';
import { useState } from 'react';

import {
  discountText,
  nextDiscountText,
  textToDiscount,
  type DiscountKind,
} from './discount-entry.js';
import type { PadKey } from './pad-entry.js';

export interface DiscountTyping {
  kind: DiscountKind;
  /** What the field shows: the text typed, or the current discount. */
  text: string;
  /** Nothing typed yet: the current discount shows selected, the first key replaces it. */
  untouched: boolean;
  /** The discount typed, or the current one while untouched; null for none. */
  value: DiscountEntry | null;
  /** A key was refused: it would have gone beyond the maximum (RG-REM-02). */
  refused: boolean;
  press: (key: PadKey) => void;
  choose: (kind: DiscountKind) => void;
  refuse: () => void;
}

/**
 * A discount typed on the pad, in % or in MGA (RG-REM-06). `fits` tells whether a discount stays
 * within its cap or grant: a key that would go beyond is refused, never corrected silently.
 */
export function useDiscountTyping(
  current: DiscountEntry | null,
  fits: (discount: DiscountEntry | null) => boolean,
): DiscountTyping {
  const [kind, setKind] = useState<DiscountKind>(current?.kind ?? 'pct');
  const [typed, setTyped] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);

  return {
    kind,
    text: typed ?? discountText(current),
    untouched: typed === null,
    value: typed === null ? current : textToDiscount(typed, kind),
    refused,
    press(key) {
      const text = nextDiscountText(typed ?? '', key, kind);
      if (key !== 'erase' && !fits(textToDiscount(text, kind))) return setRefused(true);
      setRefused(false);
      setTyped(text);
    },
    choose(next) {
      setRefused(false);
      if (next === kind) return;
      // Another kind starts empty: 5 % is not 5 MGA.
      setKind(next);
      setTyped('');
    },
    refuse: () => setRefused(true),
  };
}
