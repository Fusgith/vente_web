import type { DiscountRequestStatus, Quote } from '@vente-web/shared';
import { useEffect, useRef, type Dispatch } from 'react';

import { quotesApi } from '../api/quotes.js';
import { labels } from '../labels.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import type { DraftAction, DraftState } from './draft.js';

const text = labels.requests;

/** The owner's answer, or the end of the wait, told in the band (H53, H54). */
function decision(status: Exclude<DiscountRequestStatus, 'PENDING'>, quote: Quote): string {
  if (status !== 'GRANTED') return text.decided[status];
  return text.decided.GRANTED(quote.discountCode?.code ?? '');
}

/**
 * The quote on screen follows its request to the owner (T-033b): told of a decision, the tablet
 * reads the quote again — granted, the code applies at once (H53) — and the band says what came
 * of it. Back on line, a request still waiting is read again: an answer may have been missed.
 * Once validated, the order is told by its ticket (`OrderNotices`).
 */
export function useRequestDecisions(draft: DraftState, dispatch: Dispatch<DraftAction>) {
  const { say } = useStatusLine();
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  function follow(id: string) {
    quotesApi.get(id).then(
      (quote) => {
        const before = latest.current.request;
        dispatch({ type: 'requestChanged', quote });
        const after = quote.discountRequest;
        // Already known here (withdrawn from this tablet), or not this request's end.
        if (!after || after.status === 'PENDING' || after.id !== before?.id) return;
        if (after.status === before.status) return;
        say(decision(after.status, quote), after.status === 'GRANTED' ? 'check' : 'info');
      },
      () => undefined,
    );
  }

  useRealtimeEvent('discount.request_decided', ({ orderId }) => {
    const { saved, order } = latest.current;
    if (saved?.id === orderId && !order) follow(orderId);
  });
  useRealtimeConnect(() => {
    const { saved, order, request } = latest.current;
    if (saved && !order && request?.status === 'PENDING') follow(saved.id);
  });
}
