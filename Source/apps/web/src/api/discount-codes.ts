import {
  discountCodeListSchema,
  discountCodeSchema,
  type DiscountCode,
  type DiscountCodeIssue,
  type DiscountCodeList,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** Promo codes issued by the owner (T-034, T-091, RG-REM-04, H41, H63). */
export const discountCodesApi = {
  async list(): Promise<DiscountCodeList> {
    return parseResponse(discountCodeListSchema, await apiRequest('/discount-codes'));
  },
  async issue(input: DiscountCodeIssue): Promise<DiscountCode> {
    return parseResponse(
      discountCodeSchema,
      await apiRequest('/discount-codes', { method: 'POST', body: input }),
    );
  },
  async revoke(id: string): Promise<DiscountCode> {
    return parseResponse(
      discountCodeSchema,
      await apiRequest(`/discount-codes/${id}/revoke`, { method: 'POST' }),
    );
  },
};
