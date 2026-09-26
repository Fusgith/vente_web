import { computeQuote, ERROR_LABELS } from '@vente-web/shared';
import { useState, type Dispatch } from 'react';

import { errorMessage } from '../api/error-message.js';
import { linesConcerned, quotesApi } from '../api/quotes.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { quoteInput } from './discount-entry.js';
import { saveBody, saveSignature, type DraftAction, type DraftState } from './draft.js';

const text = labels.sales.draft;

/** The API's refusal, with the lines it names so they can be found in the table. */
function saveError(error: unknown): string {
  const lines = linesConcerned(error);
  const message = errorMessage(error);
  return lines.length > 0 ? `${message} ${text.linesConcerned(lines.join(', '))}` : message;
}

/**
 * Saves the quote (T-030): created the first time, saved again over the version read after.
 * The screen checks first what the API would refuse anyway — customer (RG-DEV-04), caps
 * (RG-REM-01/02) — and the band tells the number given, or why the API refused.
 */
export function useSaveQuote(draft: DraftState, dispatch: Dispatch<DraftAction>) {
  const { say, sayError } = useStatusLine();
  const [saving, setSaving] = useState(false);

  async function save() {
    const body = saveBody(draft);
    if (!body) {
      sayError(text.customerFirst);
      return;
    }
    if (!computeQuote(quoteInput(draft)).withinLimits) {
      sayError(ERROR_LABELS.QUOTE_DISCOUNT_BEYOND_CAP);
      return;
    }
    setSaving(true);
    try {
      const { saved } = draft;
      const quote = saved
        ? await quotesApi.update(saved.id, body, saved.version)
        : await quotesApi.create(body);
      dispatch({ type: 'saved', quote, body: saveSignature(draft) });
      say(text.saved(quote.number), 'check');
    } catch (error) {
      sayError(saveError(error));
    } finally {
      setSaving(false);
    }
  }

  return { save, saving };
}
