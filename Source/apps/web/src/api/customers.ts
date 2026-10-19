import {
  customerCategoriesSchema,
  customerPhoneTakenSchema,
  customerPurchasesSchema,
  customerSchema,
  customerSearchResultSchema,
  type Customer,
  type CustomerCreateInput,
  type CustomerPhoneTaken,
  type CustomerPurchases,
  type CustomerSearchQuery,
  type CustomerSearchResult,
  type CustomerType,
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

  /** The directory by name or phone and/or category (H49 a), as the manager reads it. */
  async directory(query: CustomerSearchQuery): Promise<CustomerSearchResult> {
    const params = new URLSearchParams(query as Record<string, string>).toString();
    return parseResponse(customerSearchResultSchema, await apiRequest(`/customers?${params}`));
  },

  async categories(): Promise<string[]> {
    const data = await apiRequest('/customers/categories');
    return parseResponse(customerCategoriesSchema, data).categories;
  },

  /** Only the manager classes a customer (H49 a). */
  async setCategory(id: string, category: string): Promise<Customer> {
    const data = await apiRequest(`/customers/${id}/category`, {
      method: 'POST',
      body: { category },
    });
    return parseResponse(customerSchema, data);
  },

  /** The manager or the owner sets the customer's type, which sets its prices (H66). */
  async setType(id: string, type: CustomerType): Promise<Customer> {
    const data = await apiRequest(`/customers/${id}/type`, { method: 'POST', body: { type } });
    return parseResponse(customerSchema, data);
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
