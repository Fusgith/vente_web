import {
  customerPhoneTakenSchema,
  customerPurchasesSchema,
  customerSchema,
  customerSearchResultSchema,
  type Customer,
  type CustomerCreateInput,
  type CustomerPhoneTaken,
  type CustomerPurchases,
  type CustomerSearchResult,
} from '@vente-web/shared';

import { ApiError, apiRequest, parseResponse } from './client.js';

/** Customer directory (T-029, RG-DEV-04). */
export const customersApi = {
  async search(q: string, signal?: AbortSignal): Promise<CustomerSearchResult> {
    const data = await apiRequest(
      `/customers?${new URLSearchParams({ q }).toString()}`,
      signal ? { signal } : {},
    );
    return parseResponse(customerSearchResultSchema, data);
  },

  async create(body: CustomerCreateInput): Promise<Customer> {
    const data = await apiRequest('/customers', { method: 'POST', body });
    return parseResponse(customerSchema, data);
  },

  /** The latest invoiced lines, shown beside the chosen customer (H47). */
  async purchases(id: string): Promise<CustomerPurchases> {
    return parseResponse(customerPurchasesSchema, await apiRequest(`/customers/${id}/purchases`));
  },
};

/** The known record the API offers instead of a duplicate phone, and the number it holds. */
export function takenBy(error: unknown): CustomerPhoneTaken | null {
  if (!(error instanceof ApiError) || error.code !== 'CUSTOMER_PHONE_TAKEN') return null;
  const parsed = customerPhoneTakenSchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}
