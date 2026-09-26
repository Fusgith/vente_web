import {
  customerSchema,
  customerSearchResultSchema,
  type Customer,
  type CustomerCreateInput,
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
};

/** The known record the API offers instead of a duplicate phone (`CUSTOMER_PHONE_TAKEN`). */
export function takenBy(error: unknown): Customer | null {
  if (!(error instanceof ApiError) || error.code !== 'CUSTOMER_PHONE_TAKEN') return null;
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('customer' in details)) return null;
  const parsed = customerSchema.safeParse(details.customer);
  return parsed.success ? parsed.data : null;
}
