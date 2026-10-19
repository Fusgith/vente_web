import {
  creditConditionListSchema,
  creditConditionSchema,
  receivableListSchema,
  receivablePaymentSchema,
  receivableSchema,
  type CreditCondition,
  type CreditConditionInput,
  type InstrumentOutcome,
  type Receivable,
  type ReceivableList,
  type ReceivablePayment,
  type ReceivablePaymentInput,
} from '@vente-web/shared';

import { API_BASE, apiRequest, parseResponse } from './client.js';

/** Credit sale (T-095, H67): the owner's conditions, the receivables and their settlement. */
export const creditApi = {
  async conditions(): Promise<CreditCondition[]> {
    return parseResponse(creditConditionListSchema, await apiRequest('/credit-conditions')).items;
  },
  async createCondition(input: CreditConditionInput): Promise<CreditCondition> {
    return parseResponse(
      creditConditionSchema,
      await apiRequest('/credit-conditions', { method: 'POST', body: input }),
    );
  },
  async updateCondition(id: string, input: CreditConditionInput): Promise<CreditCondition> {
    return parseResponse(
      creditConditionSchema,
      await apiRequest(`/credit-conditions/${id}`, { method: 'PUT', body: input }),
    );
  },
  async receivables(q = ''): Promise<ReceivableList> {
    const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return parseResponse(receivableListSchema, await apiRequest(`/receivables${query}`));
  },
  async settle(id: string, input: ReceivablePaymentInput): Promise<ReceivablePayment> {
    return parseResponse(
      receivablePaymentSchema,
      await apiRequest(`/receivables/${id}/settlements`, { method: 'POST', body: input }),
    );
  },
  /** T-096 (H73): the manager says what the bank did with a bill or a post-dated check. */
  async markInstrument(id: string, outcome: InstrumentOutcome): Promise<Receivable> {
    return parseResponse(
      receivableSchema,
      await apiRequest(`/receivables/${id}/instrument`, { method: 'POST', body: { outcome } }),
    );
  },
  receiptPdfUrl(settlementId: string): string {
    return `${API_BASE}/receivable-settlements/${settlementId}/pdf`;
  },
};
