import type { Quote } from '@vente-web/shared';

import type { Db } from '../db.js';
import { renderPdf } from '../pdf/render.js';
import { quoteDocument } from '../pdf/templates/quote.js';
import { loadQuote } from './quotes.js';
import { readPositiveIntSetting } from './settings.js';
import { shopDate } from './shop-time.js';
import { readStoreLegal } from './store-legal.js';
import { readStoreLogo } from './store-logo.js';

/**
 * Date and validity printed on a quote (RG-FAC-06, decision H27): the shop's day it was created,
 * and `validityDays` days after it (RG-DEV-02), whatever was saved since.
 */
export function quoteDates(
  quote: Pick<Quote, 'createdAt'>,
  validityDays: number,
): { issuedOn: string; validUntil: string } {
  const created = new Date(quote.createdAt);
  return { issuedOn: shopDate(created), validUntil: shopDate(created, validityDays) };
}

/**
 * The quote's PDF (RG-DEV-05, RG-FAC-06), made again at each request: a quote changes until it
 * is validated, and nothing legal hangs on it — unlike the invoice, kept as issued (RG-FAC-04).
 */
export async function quotePdf(
  db: Db,
  filesDir: string,
  id: string,
): Promise<{ number: string; pdf: Buffer }> {
  const quote = await loadQuote(db, id);
  const [legal, validityDays, logo] = await Promise.all([
    readStoreLegal(db),
    readPositiveIntSetting(db, 'quote_validity_days', 7),
    readStoreLogo(filesDir),
  ]);
  const doc = quoteDocument(quote, { legal, logo, ...quoteDates(quote, validityDays) });
  return { number: quote.number, pdf: await renderPdf(doc) };
}
