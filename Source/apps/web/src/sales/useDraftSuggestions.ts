import { useEffect, useMemo, useState } from 'react';

import { discountRulesApi } from '../api/discount-rules.js';
import type { DraftState } from './draft.js';

interface Read {
  signature: string;
  pcts: (string | null)[];
}

/**
 * The draft with what the owner's rules suggest on each line (H62), when the salesperson
 * discounts (H60) and a customer is chosen: read again whenever a line or the customer changes.
 * Only a read of the draft shown counts; a failed read suggests nothing — the caps still hold,
 * and the API checks again on saving.
 */
export function useDraftSuggestions(draft: DraftState, allowed: boolean): DraftState {
  const [read, setRead] = useState<Read | null>(null);
  const customerId = draft.customer?.id;
  const lines = draft.lines.map((line) => ({ productUnitId: line.unit.id, qty: line.qty }));
  const signature =
    allowed && customerId && lines.length > 0 ? JSON.stringify({ customerId, lines }) : '';

  useEffect(() => {
    if (!signature) return;
    let current = true;
    discountRulesApi.forDraft(JSON.parse(signature)).then(
      (suggested) => {
        if (current) setRead({ signature, pcts: suggested.lines });
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [signature]);

  return useMemo(
    () =>
      read && signature && read.signature === signature
        ? {
            ...draft,
            lines: draft.lines.map((line, index) => ({
              ...line,
              suggestedPct: read.pcts[index] ?? null,
            })),
          }
        : draft,
    [draft, read, signature],
  );
}
