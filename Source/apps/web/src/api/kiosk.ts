import {
  kioskBasketListSchema,
  kioskBasketSentSchema,
  kioskBasketTakenSchema,
  kioskHomeSchema,
  kioskSearchResultSchema,
  type KioskBasket,
  type KioskBasketInput,
  type KioskHome,
  type KioskSearchResult,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

const kiosk = (key: string) => `/kiosk/${encodeURIComponent(key)}`;

/** The self-service kiosk, opened by its key without an account (T-036, RG-BOR-01 à 04). */
export const kioskApi = {
  async home(key: string): Promise<KioskHome> {
    return parseResponse(kioskHomeSchema, await apiRequest(kiosk(key)));
  },

  async search(key: string, q: string, signal?: AbortSignal): Promise<KioskSearchResult> {
    const data = await apiRequest(
      `${kiosk(key)}/search?${new URLSearchParams({ q }).toString()}`,
      signal ? { signal } : {},
    );
    return parseResponse(kioskSearchResultSchema, data);
  },

  /** Sends the basket; resolves with its number (« P12 »). */
  async send(key: string, basket: KioskBasketInput): Promise<string> {
    const data = await apiRequest(`${kiosk(key)}/baskets`, { method: 'POST', body: basket });
    return parseResponse(kioskBasketSentSchema, data).basket;
  },
};

/** The salespeople's side: today's baskets waiting, taken as a quote (RG-BOR-05). */
export const kioskBasketsApi = {
  async pending(signal?: AbortSignal): Promise<KioskBasket[]> {
    const data = await apiRequest('/kiosk-baskets', signal ? { signal } : {});
    return parseResponse(kioskBasketListSchema, data).items;
  },

  /** Resolves with the id of the quote made from the basket. */
  async take(id: string): Promise<string> {
    const data = await apiRequest(`/kiosk-baskets/${id}/take`, { method: 'POST' });
    return parseResponse(kioskBasketTakenSchema, data).quoteId;
  },
};
