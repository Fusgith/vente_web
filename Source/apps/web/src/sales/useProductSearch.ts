import { SEARCH_MIN_LENGTH, type ProductSearchResult } from '@vente-web/shared';
import { useCallback, useEffect, useState } from 'react';

import { catalogApi } from '../api/catalog.js';
import { errorMessage } from '../api/error-message.js';

/** Pause after the last key before searching: fast typing sends one request (RG-DEV-06 §1). */
export const SEARCH_DEBOUNCE_MS = 150;

export type SearchState =
  | { status: 'idle' }
  /** `previous` keeps the last list on screen while the next one loads, without flicker. */
  | { status: 'loading'; previous: ProductSearchResult | null }
  | { status: 'done'; result: ProductSearchResult }
  | { status: 'error'; message: string };

type Settled = { key: string; result: ProductSearchResult } | { key: string; error: string };

const searchKey = (term: string, categoryId: string | undefined) => `${categoryId ?? ''}|${term}`;

/**
 * Search while typing, from the 2nd character; a newer term cancels the request in flight.
 * `lookup` answers at once for Enter or a scan, reusing the list already shown for that term.
 */
export function useProductSearch(term: string, categoryId: string | undefined) {
  const [settled, setSettled] = useState<Settled | null>(null);
  const active = term.length >= SEARCH_MIN_LENGTH;
  const key = searchKey(term, categoryId);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      catalogApi.search(term, categoryId, controller.signal).then(
        (result) => setSettled({ key, result }),
        (error: unknown) => {
          if (!controller.signal.aborted) setSettled({ key, error: errorMessage(error) });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, key, term, categoryId]);

  const lookup = useCallback(
    async (value: string): Promise<ProductSearchResult> => {
      if (settled?.key === searchKey(value, categoryId) && 'result' in settled) {
        return settled.result;
      }
      return catalogApi.search(value, categoryId);
    },
    [settled, categoryId],
  );

  let state: SearchState;
  if (!active) {
    // A field emptied below 2 characters shows the favorites again.
    state = { status: 'idle' };
  } else if (settled?.key !== key) {
    state = { status: 'loading', previous: settled && 'result' in settled ? settled.result : null };
  } else {
    state =
      'result' in settled
        ? { status: 'done', result: settled.result }
        : { status: 'error', message: settled.error };
  }
  return { state, lookup };
}
