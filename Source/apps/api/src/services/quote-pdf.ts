import type { Db } from '../db.js';
import { renderPdf } from '../pdf/render.js';
import { quoteDocument } from '../pdf/templates/quote.js';
import { loadQuote } from './quotes.js';
import { readPositiveIntSetting } from './settings.js';
import { shopDate } from './shop-time.js';
import { readStoreLegal } from './store-legal.js';

/**
 * The quote's PDF (RG-DEV-05, RG-FAC-06), made again at each request: a quote changes until it
 * is validated, and nothing legal hangs on it — unlike the invoice, kept as issued (RG-FAC-04).
 * ⚠️ HYPOTHÈSE H27: its date is the last save, when its prices were last set; it is valid
 * `quote_validity_days` days after it (RG-DEV-02).
 */
export async function quotePdf(db: Db, id: string): Promise<{ number: string; pdf: Buffer }> {
  const quote = await loadQuote(db, id);
  const [legal, validityDays] = await Promise.all([
    readStoreLegal(db),
    readPositiveIntSetting(db, 'quote_validity_days', 7),
  ]);
  const saved = new Date(quote.updatedAt);
  const doc = quoteDocument(quote, {
    legal,
    issuedOn: shopDate(saved),
    validUntil: shopDate(saved, validityDays),
  });
  return { number: quote.number, pdf: await renderPdf(doc) };
}
