import {
  promotionListSchema,
  promotionSchema,
  type Promotion,
  type PromotionCreate,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** Products « à proposer », marked by the owner (T-037, RG-DEV-06 §6, H49 b). */
export const promotionsApi = {
  async list(): Promise<Promotion[]> {
    return parseResponse(promotionListSchema, await apiRequest('/promotions')).items;
  },
  async create(input: PromotionCreate): Promise<Promotion> {
    return parseResponse(
      promotionSchema,
      await apiRequest('/promotions', { method: 'POST', body: input }),
    );
  },
  async withdraw(id: string): Promise<Promotion> {
    return parseResponse(
      promotionSchema,
      await apiRequest(`/promotions/${id}/withdraw`, { method: 'POST' }),
    );
  },
};
