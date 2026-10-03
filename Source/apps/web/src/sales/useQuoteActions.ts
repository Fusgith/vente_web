import {
  computeQuote,
  ERROR_LABELS,
  formatMga,
  formatQty,
  normalizeDiscountCode,
  ticketLabel,
  type DiscountRequestCreate,
  type Quote,
  type StockShortage,
} from '@vente-web/shared';
import { useState, type Dispatch } from 'react';

import { ApiError } from '../api/client.js';
import { discountRequestsApi, requestPending } from '../api/discount-requests.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi, stockShortages } from '../api/orders.js';
import { linesConcerned, quotesApi } from '../api/quotes.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { quoteInput } from './discount-entry.js';
import {
  orderBroughtDown,
  saveBody,
  saveSignature,
  unsavedChanges,
  type DraftAction,
  type DraftState,
  type SavedQuote,
} from './draft.js';

const text = labels.sales.draft;
const codeText = labels.sales.code;
const requestText = labels.requests;

/** What the request sheet sends: the quote it goes on is the one saved (T-033b). */
export type RequestInput = Omit<DiscountRequestCreate, 'orderId' | 'version'>;

/** An answer the request may have been lost behind, or a request made meanwhile (H51). */
const REQUEST_UNSURE = new Set(['NETWORK_ERROR', 'QUOTE_CHANGED', 'DISCOUNT_REQUEST_PENDING']);

/** The API's refusal, with the lines it names so they can be found in the table. */
function refusal(error: unknown, message = errorMessage(error)): string {
  const lines = linesConcerned(error);
  return lines.length > 0 ? `${message} ${text.linesConcerned(lines.join(', '))}` : message;
}

const codeMessages: Partial<Record<string, string>> = {
  QUOTE_DISCOUNT_BEYOND_CAP: codeText.beyondCap,
  ORDER_PRICE_CHANGED: codeText.priceChanged,
};

/** A refusal while the code goes on, told for that step. */
function codeRefusal(error: unknown): string {
  const message = error instanceof ApiError ? codeMessages[error.code] : undefined;
  return refusal(error, message);
}

/** The quote the code goes on: its id and the version read. */
type QuoteRef = Pick<SavedQuote, 'id' | 'version'>;

/** The quote read again carries this very code, just put on over `target`: the answer was lost. */
const attachedMeanwhile = (quote: Quote, typed: string, target: QuoteRef) =>
  !!quote.discountCode &&
  quote.version === target.version + 1 &&
  normalizeDiscountCode(quote.discountCode.code) === normalizeDiscountCode(typed);

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

/** A save, a validation or the owner's code under way: the buttons wait. */
export type QuoteBusy = 'save' | 'submit' | 'code' | 'request' | null;

/**
 * Saves the quote (T-030) and validates it into an order (T-032). The screen checks first what
 * the API would refuse anyway — customer (RG-DEV-04), caps (RG-REM-01/02) — and the band tells
 * the number or the ticket given, or why the API refused.
 *
 * « Valider la commande » saves what is on screen first. If that save priced a line differently
 * from the screen, the validation stops there: the customer agrees to the new amount due before
 * anything is reserved (H28). A price changed after the save is refused by the API; the quote
 * is then saved again at the new price, for the same check.
 *
 * The owner's code (T-034b, H42) goes on a saved quote: the screen is saved first if it changed,
 * then the API attaches the code and applies what it grants. A request to the owner (T-033b, H51)
 * goes the same way; while it waits, it may be withdrawn with the customer's agreement (H54).
 */
export function useQuoteActions(draft: DraftState, dispatch: Dispatch<DraftAction>) {
  const { say, sayError } = useStatusLine();
  const [busy, setBusy] = useState<QuoteBusy>(null);

  /** Why the screen cannot be saved, before the API refuses it; null when it can. */
  function unsaveable(
    customerFirst: string,
    beyondCap: string = ERROR_LABELS.QUOTE_DISCOUNT_BEYOND_CAP,
  ): string | null {
    if (!draft.customer) return customerFirst;
    return computeQuote(quoteInput(draft)).withinLimits ? null : beyondCap;
  }

  /** The quote as on screen, created or saved over the version read; null without a customer. */
  async function store(): Promise<Quote | null> {
    const body = saveBody(draft);
    if (!body) return null;
    const { saved } = draft;
    const quote = saved
      ? await quotesApi.update(saved.id, body, saved.version)
      : await quotesApi.create(body);
    dispatch({ type: 'saved', quote, body: saveSignature(draft) });
    return quote;
  }

  /** The quote as on screen, saved; null when refused (said). */
  async function persist(customerFirst: string): Promise<Quote | null> {
    const refused = unsaveable(customerFirst);
    if (refused) {
      sayError(refused);
      return null;
    }
    return store();
  }

  async function run(kind: Exclude<QuoteBusy, null>, action: () => Promise<void>) {
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
  async function reprice(id: string, version: number) {
    const body = saveBody(draft);
    if (!body) return;
    const quote = await quotesApi.update(id, body, version);
    dispatch({ type: 'saved', quote, body: saveSignature(draft) });
  }

  const submit = () =>
    run('submit', async () => {
      const shown = computeQuote(quoteInput(draft)).total;
      // An order is never free (RG-PAY-02, H50): the API would refuse it, nothing is sent.
      if (shown === '0.00') {
        sayError(ERROR_LABELS.ORDER_TOTAL_ZERO);
        return;
      }
      let target = draft.saved;
      if (!target || unsavedChanges(draft)) {
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
          await reprice(target.id, target.version);
          sayError(refusal(error));
        } else {
          throw error;
        }
      }
    });

  /** The code on the quote: the screen takes what it grants; the band says so. */
  function attached(quote: Quote) {
    dispatch({ type: 'codeAttached', quote, sent: draft });
    if (!quote.discountCode) return;
    const { code } = quote.discountCode;
    say(
      orderBroughtDown(draft, quote)
        ? codeText.attachedLowered(code, formatMga(quote.orderDiscount))
        : codeText.attached(code),
      'check',
    );
  }

  /**
   * A refusal of the code, for the sheet. The answer lost on the Wi-Fi (or a second try after it)
   * may hide a code that went on: the quote read again tells. A price changed since the save: the
   * quote is saved again at the new price, for the customer to agree first, as on validating.
   */
  async function attachRefused(error: unknown, typed: string, target: QuoteRef | null) {
    if (!(error instanceof ApiError) || !target) return codeRefusal(error);
    try {
      if (error.code === 'NETWORK_ERROR' || error.code === 'QUOTE_CHANGED') {
        const quote = await quotesApi.get(target.id);
        if (attachedMeanwhile(quote, typed, target)) {
          attached(quote);
          return null;
        }
      }
      if (error.code === 'ORDER_PRICE_CHANGED') await reprice(target.id, target.version);
    } catch (again) {
      // Still no answer, or the save at the new price refused: the first refusal stays.
      if (error.code === 'ORDER_PRICE_CHANGED') return codeRefusal(again);
    }
    return codeRefusal(error);
  }

  /**
   * The owner's code typed in its sheet: null once attached (the band says so), else why it was
   * refused, for the sheet to show under the field.
   */
  async function attachCode(typed: string): Promise<string | null> {
    const changed = !draft.saved || unsavedChanges(draft);
    const refused = changed ? unsaveable(codeText.customerFirst, codeText.beyondCap) : null;
    if (refused) return refused;
    setBusy('code');
    let target: QuoteRef | null = draft.saved ?? null;
    try {
      if (changed) target = await store();
      if (!target) return codeText.customerFirst;
      attached(await quotesApi.attachCode(target.id, typed, target.version));
      return null;
    } catch (error) {
      return await attachRefused(error, typed, target);
    } finally {
      setBusy(null);
    }
  }

  /**
   * A refusal of the request, for the sheet. The answer lost on the Wi-Fi may hide a request that
   * went through, and a request made meanwhile holds the quote: the quote read again tells.
   */
  async function askRefused(error: unknown, target: QuoteRef | null): Promise<string | null> {
    if (error instanceof ApiError && target && REQUEST_UNSURE.has(error.code)) {
      const quote = await quotesApi.get(target.id).catch(() => null);
      if (quote && requestPending(quote.discountRequest)) {
        dispatch({ type: 'requestChanged', quote });
        if (error.code === 'NETWORK_ERROR') {
          say(requestText.sent, 'check');
          return null;
        }
      }
    }
    return refusal(error);
  }

  /**
   * The request from its sheet (H51): the screen saved first if it changed, so that the owner
   * decides on the quote as shown. Null once sent (the band says so), else why it was refused.
   */
  async function ask(request: RequestInput): Promise<string | null> {
    const changed = !draft.saved || unsavedChanges(draft);
    const refused = changed ? unsaveable(requestText.customerFirst, requestText.beyondCap) : null;
    if (refused) return refused;
    setBusy('request');
    let target: QuoteRef | null = draft.saved ?? null;
    try {
      if (changed) target = await store();
      if (!target) return requestText.customerFirst;
      const quote = await discountRequestsApi.create({
        orderId: target.id,
        version: target.version,
        ...request,
      });
      dispatch({ type: 'requestChanged', quote });
      say(requestText.sent, 'check');
      return null;
    } catch (error) {
      return await askRefused(error, target);
    } finally {
      setBusy(null);
    }
  }

  /** The request withdrawn with the customer's agreement (H54): the caps hold again. */
  const withdraw = () =>
    run('request', async () => {
      const { request, saved } = draft;
      if (!request || !saved) return;
      try {
        dispatch({ type: 'requestChanged', quote: await discountRequestsApi.withdraw(request.id) });
        say(requestText.withdrawn, 'check');
      } catch (error) {
        // Decided meanwhile: the screen shows the answer, the band why nothing was withdrawn.
        const quote = await quotesApi.get(saved.id).catch(() => null);
        if (quote) dispatch({ type: 'requestChanged', quote });
        throw error;
      }
    });

  return { save, submit, attachCode, ask, withdraw, busy };
}
