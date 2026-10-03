import {
  discountReasonsSchema,
  discountRequestListSchema,
  discountRequestSchema,
  orderSchema,
  type DiscountRequest,
  type DiscountRequestCreate,
  type DiscountRequestGrant,
  type DiscountRequestList,
  type DiscountRequestSummary,
  type Order,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/**
 * Still awaiting the owner: past its day end, before the sweep closes it, a request holds the
 * order no more — it is paid within the caps (H54).
 */
export const requestPending = (
  request: DiscountRequestSummary | null | undefined,
  now = Date.now(),
): request is DiscountRequestSummary =>
  request?.status === 'PENDING' && Date.parse(request.expiresAt) > now;

/** A product of the quote or of the order: asked once, for all its sale units (H41, H51). */
export interface RequestProduct {
  id: string;
  sku: string;
  name: string;
}

/** The products of the lines, each once, in the order of the lines. */
export function requestProducts(products: readonly RequestProduct[]): RequestProduct[] {
  const seen = new Map(products.map(({ id, sku, name }) => [id, { id, sku, name }]));
  return [...seen.values()];
}

const post = (path: string, body?: unknown) => apiRequest(path, { method: 'POST', body });

/** Exceptional discount requests to the owner (T-033, RG-REM-03/05, H51 to H54). */
export const discountRequestsApi = {
  /** The reasons offered (setting `discount_reasons`, H51). */
  async reasons(): Promise<string[]> {
    return parseResponse(discountReasonsSchema, await apiRequest('/discount-requests/reasons'))
      .reasons;
  },
  /** For the owner, and the manager reading (H54): pending, then closed this shop day. */
  async list(): Promise<DiscountRequestList> {
    return parseResponse(discountRequestListSchema, await apiRequest('/discount-requests'));
  },
  /** The quote or the order, its request now pending, at its next version. */
  async create(input: DiscountRequestCreate): Promise<Order> {
    return parseResponse(orderSchema, await post('/discount-requests', input));
  },
  async grant(id: string, items: DiscountRequestGrant['items']): Promise<DiscountRequest> {
    return parseResponse(
      discountRequestSchema,
      await post(`/discount-requests/${id}/grant`, { items }),
    );
  },
  async reject(id: string): Promise<DiscountRequest> {
    return parseResponse(discountRequestSchema, await post(`/discount-requests/${id}/reject`));
  },
  async withdraw(id: string): Promise<Order> {
    return parseResponse(orderSchema, await post(`/discount-requests/${id}/withdraw`));
  },
  /** Back to the queue at its place while the owner decides (H52). */
  async setAside(orderId: string): Promise<Order> {
    return parseResponse(orderSchema, await post(`/orders/${orderId}/set-aside`));
  },
};
