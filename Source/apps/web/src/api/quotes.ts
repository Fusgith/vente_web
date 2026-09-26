import { quoteSchema, type Quote, type QuoteSave } from '@vente-web/shared';

import { API_BASE, ApiError, apiRequest, parseResponse } from './client.js';

/** Quotes (T-030, RG-DEV-01/02): the API prices the lines, checks the caps and numbers. */
export const quotesApi = {
  async create(body: QuoteSave): Promise<Quote> {
    const data = await apiRequest('/quotes', { method: 'POST', body });
    return parseResponse(quoteSchema, data);
  },

  /** `version`: the one last read; a quote saved meanwhile elsewhere is refused, not overwritten. */
  async update(id: string, body: QuoteSave, version: number): Promise<Quote> {
    const data = await apiRequest(`/quotes/${id}`, { method: 'PUT', body: { ...body, version } });
    return parseResponse(quoteSchema, data);
  },

  /** Opened in a tab, where the browser prints or shares it (RG-PDF-01). */
  pdfUrl(id: string): string {
    return `${API_BASE}/quotes/${id}/pdf`;
  },
};

/** Positions of the lines named by `QUOTE_DISCOUNT_BEYOND_CAP` or `QUOTE_LINE_UNAVAILABLE`. */
export function linesConcerned(error: unknown): number[] {
  if (!(error instanceof ApiError)) return [];
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('lines' in details)) return [];
  const lines = details.lines;
  return Array.isArray(lines) ? lines.filter((line) => Number.isInteger(line)) : [];
}
