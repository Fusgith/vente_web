import {
  computeQuote,
  ERROR_LABELS,
  formatMga,
  formatQty,
  ticketLabel,
  type Quote,
  type StockShortage,
} from '@vente-web/shared';
import { useState, type Dispatch } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi, stockShortages } from '../api/orders.js';
import { linesConcerned, quotesApi } from '../api/quotes.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { quoteInput } from './discount-entry.js';
import {
  saveBody,
  saveSignature,
  unsavedChanges,
  type DraftAction,
  type DraftState,
} from './draft.js';

const text = labels.sales.draft;

/** The API's refusal, with the lines it names so they can be found in the table. */
function refusal(error: unknown): string {
  const lines = linesConcerned(error);
  const message = errorMessage(error);
  return lines.length > 0 ? `${message} ${text.linesConcerned(lines.join(', '))}` : message;
}

/** RG-CMD-02: « SAV-001 : 432 disponibles, 433 demandés (pièce) », one product after another. */
function shortageMessage(shortages: StockShortage[]): string {
  const detail = shortages.map(
    (shortage) =>
      `${shortage.sku} : ${labels.sales.stock.counts(
        formatQty(shortage.available),
        formatQty(shortage.requested),
        shortage.baseUnit,
      )}`,
  );
  return `${labels.sales.stock.title} — ${detail.join(' ; ')}.`;
}

type Busy = 'save' | 'submit' | null;

/**
 * Saves the quote (T-030) and validates it into an order (T-032). The screen checks first what
 * the API would refuse anyway — customer (RG-DEV-04), caps (RG-REM-01/02) — and the band tells
 * the number or the ticket given, or why the API refused.
 *
 * « Valider la commande » saves what is on screen first. If that save priced a line differently
 * from the screen, the validation stops there: the customer agrees to the new amount due before
 * anything is reserved (⚠️ H28). A price changed after the save is refused by the API; the quote
 * is then saved again at the new price, for the same check.
 */
export function useQuoteActions(draft: DraftState, dispatch: Dispatch<DraftAction>) {
  const { say, sayError } = useStatusLine();
  const [busy, setBusy] = useState<Busy>(null);

  /** The quote as on screen, created or saved over the version read; null when refused (said). */
  async function persist(customerFirst: string): Promise<Quote | null> {
    const body = saveBody(draft);
    if (!body) {
      sayError(customerFirst);
      return null;
    }
    if (!computeQuote(quoteInput(draft)).withinLimits) {
      sayError(ERROR_LABELS.QUOTE_DISCOUNT_BEYOND_CAP);
      return null;
    }
    const { saved } = draft;
    const quote = saved
      ? await quotesApi.update(saved.id, body, saved.version)
      : await quotesApi.create(body);
    dispatch({ type: 'saved', quote, body: saveSignature(draft) });
    return quote;
  }

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (error) {
      sayError(refusal(error));
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run('save', async () => {
      const quote = await persist(text.customerFirst);
      if (quote) say(text.saved(quote.number), 'check');
    });

  /** The quote saved again over `version`, at the prices in force now. */
  async function reprice(id: string, version: number, error: ApiError) {
    const body = saveBody(draft);
    if (!body) return;
    const quote = await quotesApi.update(id, body, version);
    dispatch({ type: 'saved', quote, body: saveSignature(draft) });
    sayError(refusal(error));
  }

  const submit = () =>
    run('submit', async () => {
      let target = draft.saved;
      if (!target || unsavedChanges(draft)) {
        const shown = computeQuote(quoteInput(draft)).total;
        const quote = await persist(text.customerFirstOrder);
        if (!quote) return;
        if (quote.total !== shown) {
          sayError(text.pricesUpdated(formatMga(quote.total)));
          return;
        }
        target = { id: quote.id, number: quote.number, version: quote.version, body: '' };
      }
      try {
        const order = await ordersApi.submit(target.id, target.version);
        dispatch({ type: 'submitted', order });
        if (order.ticket)
          say(text.submitted(ticketLabel(order.ticket), order.customer.name), 'check');
      } catch (error) {
        const shortages = stockShortages(error);
        if (shortages.length > 0) {
          dispatch({ type: 'short', shortages });
          sayError(shortageMessage(shortages));
        } else if (error instanceof ApiError && error.code === 'ORDER_PRICE_CHANGED') {
          await reprice(target.id, target.version, error);
        } else {
          throw error;
        }
      }
    });

  return { save, submit, busy };
}
