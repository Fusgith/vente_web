import {
  discountCodeListSchema,
  discountCodeSchema,
  type DiscountCode,
  type DiscountCodeIssue,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** Discount codes issued by the owner (T-034, RG-REM-04, H41). */
export const discountCodesApi = {
  async list(): Promise<DiscountCode[]> {
    return parseResponse(discountCodeListSchema, await apiRequest('/discount-codes')).items;
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
