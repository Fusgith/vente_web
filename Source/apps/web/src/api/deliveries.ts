import { orderSchema, type Order } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

const post = async (path: string, body?: unknown): Promise<Order> =>
  parseResponse(orderSchema, await apiRequest(path, { method: 'POST', ...(body ? { body } : {}) }));

/** The counters (T-060, RG-LIV-01 à 03): take, prepare, call, hand over. */
export const deliveriesApi = {
  takeNext: () => post('/queues/delivery/take-next'),
  /** Out of turn: the customer stands at the counter. */
  take: (orderId: string) => post(`/orders/${orderId}/delivery/take`),
  ready: (orderId: string) => post(`/orders/${orderId}/delivery/ready`),
  noShow: (orderId: string) => post(`/orders/${orderId}/delivery/no-show`),
  /** Every line ticked, by position, over the version read (RG-LIV-03). */
  deliver: (orderId: string, version: number, delivered: number[]) =>
    post(`/orders/${orderId}/delivery/deliver`, { version, delivered }),
};
