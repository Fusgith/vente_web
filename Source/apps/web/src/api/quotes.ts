import {
  orderSummaryListSchema,
  quoteSchema,
  type OrderSummary,
  type Quote,
  type QuoteSave,
} from '@vente-web/shared';

import { API_BASE, ApiError, apiRequest, parseResponse } from './client.js';

/** Quotes (T-030, RG-DEV-01/02): the API prices the lines, checks the caps and numbers. */
export const quotesApi = {
  /**
   * The salesperson's quotes and orders not paid, the latest changed first; with `number`, the
   * quote of that number, a colleague's too (RG-DEV-03, H56).
   */
  async list(number?: string): Promise<OrderSummary[]> {
    const query = number ? `?number=${encodeURIComponent(number)}` : '';
    return parseResponse(orderSummaryListSchema, await apiRequest(`/quotes${query}`)).orders;
  },

  async get(id: string): Promise<Quote> {
    return parseResponse(quoteSchema, await apiRequest(`/quotes/${id}`));
  },

  async create(body: QuoteSave): Promise<Quote> {
    const data = await apiRequest('/quotes', { method: 'POST', body });
    return parseResponse(quoteSchema, data);
  },

  /** `version`: the one last read; a quote saved meanwhile elsewhere is refused, not overwritten. */
  async update(id: string, body: QuoteSave, version: number): Promise<Quote> {
    const data = await apiRequest(`/quotes/${id}`, { method: 'PUT', body: { ...body, version } });
    return parseResponse(quoteSchema, data);
  },

  /**
   * The owner's code typed on the quote (T-034b, RG-REM-04, H42): used at once, and what it grants
   * applied to the lines and the total it covers. `version`: the one last read, as on saving.
   */
  async attachCode(id: string, code: string, version: number): Promise<Quote> {
    const data = await apiRequest(`/quotes/${id}/discount-code`, {
      method: 'POST',
      body: { code, version },
    });
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
