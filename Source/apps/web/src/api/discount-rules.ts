import {
  discountRuleListSchema,
  discountRuleSchema,
  draftSuggestedSchema,
  suggestedDiscountsSchema,
  type DiscountRule,
  type DiscountRuleInput,
  type DraftSuggested,
  type DraftSuggestedInput,
  type SuggestedDiscounts,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The owner's discount rules (T-090, H62) and what they suggest on an order (H61). */
export const discountRulesApi = {
  async list(): Promise<DiscountRule[]> {
    return parseResponse(discountRuleListSchema, await apiRequest('/discount-rules')).items;
  },
  async create(input: DiscountRuleInput): Promise<DiscountRule> {
    return parseResponse(
      discountRuleSchema,
      await apiRequest('/discount-rules', { method: 'POST', body: input }),
    );
  },
  async update(id: string, input: DiscountRuleInput): Promise<DiscountRule> {
    return parseResponse(
      discountRuleSchema,
      await apiRequest(`/discount-rules/${id}`, { method: 'PUT', body: input }),
    );
  },
  async suggested(orderId: string): Promise<SuggestedDiscounts> {
    return parseResponse(
      suggestedDiscountsSchema,
      await apiRequest(`/orders/${orderId}/suggested-discounts`),
    );
  },
  /** On the tablet's draft, before it is saved (H62). */
  async forDraft(input: DraftSuggestedInput): Promise<DraftSuggested> {
    return parseResponse(
      draftSuggestedSchema,
      await apiRequest('/suggested-discounts', { method: 'POST', body: input }),
    );
  },
};
