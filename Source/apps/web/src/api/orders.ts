import {
  orderSchema,
  stockUnavailableSchema,
  type Order,
  type OrderAdjust,
  type OrderDiscounts,
  type StockShortage,
} from '@vente-web/shared';

import { ApiError, apiRequest, parseResponse } from './client.js';

/** Orders (T-032, RG-CMD-03): the API freezes the prices, reserves the stock, gives the ticket. */
export const ordersApi = {
  async get(id: string): Promise<Order> {
    return parseResponse(orderSchema, await apiRequest(`/orders/${id}`));
  },

  /** Lines lowered or removed at the register (RG-CMD-05b), over the version read. */
  async adjust(id: string, version: number, changes: OrderAdjust['changes']): Promise<Order> {
    const data = await apiRequest(`/orders/${id}/adjust`, {
      method: 'POST',
      body: { version, changes },
    });
    return parseResponse(orderSchema, data);
  },

  /**
   * Discounts within the caps applied at the register (H61), over the version read: each line by
   * its position, null removing its discount; the total only when given.
   */
  async discount(id: string, body: OrderDiscounts): Promise<Order> {
    const data = await apiRequest(`/orders/${id}/discounts`, { method: 'POST', body });
    return parseResponse(orderSchema, data);
  },

  /** The owner's code typed at the register before payment, over the version read (H42). */
  async attachCode(id: string, code: string, version: number): Promise<Order> {
    const data = await apiRequest(`/orders/${id}/discount-code`, {
      method: 'POST',
      body: { code, version },
    });
    return parseResponse(orderSchema, data);
  },

  /** Before payment, with its reason (RG-ANN-01). */
  async cancel(id: string, version: number, reason: string): Promise<Order> {
    const data = await apiRequest(`/orders/${id}/cancel`, {
      method: 'POST',
      body: { version, reason },
    });
    return parseResponse(orderSchema, data);
  },

  /**
   * An expired order sent to the register again (RG-CMD-08, H56): refused for a price changed, a
   * stock short or a discount beyond the cap, it is a quote again to take up.
   */
  async reactivate(id: string, version: number): Promise<Order> {
    const data = await apiRequest(`/orders/${id}/reactivate`, {
      method: 'POST',
      body: { version },
    });
    return parseResponse(orderSchema, data);
  },
  /**
   * The order at the register sent back to its salesperson (RG-CMD-05b, H56): a quote again, same
   * number, keeping its ticket and its place; its reservation is freed.
   */
  async sendBack(id: string, version: number): Promise<Order> {
    const data = await apiRequest(`/orders/${id}/send-back`, { method: 'POST', body: { version } });
    return parseResponse(orderSchema, data);
  },

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
