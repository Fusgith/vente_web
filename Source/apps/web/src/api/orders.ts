import {
  orderSchema,
  stockUnavailableSchema,
  type Order,
  type StockShortage,
} from '@vente-web/shared';

import { ApiError, apiRequest, parseResponse } from './client.js';

/** Orders (T-032, RG-CMD-03): the API freezes the prices, reserves the stock, gives the ticket. */
export const ordersApi = {
  /** Validates the quote saved under `version`, the one last read. */
  async submit(id: string, version: number): Promise<Order> {
    const data = await apiRequest(`/orders/${id}/submit`, { method: 'POST', body: { version } });
    return parseResponse(orderSchema, data);
  },
};

/** The products named by `STOCK_UNAVAILABLE` (RG-CMD-02); none for any other error. */
export function stockShortages(error: unknown): StockShortage[] {
  if (!(error instanceof ApiError) || error.code !== 'STOCK_UNAVAILABLE') return [];
  const parsed = stockUnavailableSchema.safeParse(error.details);
  return parsed.success ? parsed.data.shortages : [];
}
