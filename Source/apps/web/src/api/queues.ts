import {
  orderSchema,
  queueSchema,
  type Order,
  type Queue,
  type QueueMove,
  type QueueName,
  type QueuePriority,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The queues (T-040, RG-FIL-01 à 04): the API orders them, the screens show and act. */
export const queuesApi = {
  async get(queue: QueueName): Promise<Queue> {
    return parseResponse(queueSchema, await apiRequest(`/queues/${queue}`));
  },

  async callNext(): Promise<Order> {
    const data = await apiRequest('/queues/register/call-next', { method: 'POST' });
    return parseResponse(orderSchema, data);
  },

  /** Out of turn: the customer stands at the register (RG-FIL-03). */
  async call(orderId: string): Promise<Order> {
    const data = await apiRequest(`/orders/${orderId}/call`, { method: 'POST' });
    return parseResponse(orderSchema, data);
  },

  async noShow(orderId: string): Promise<Order> {
    const data = await apiRequest(`/orders/${orderId}/no-show`, { method: 'POST' });
    return parseResponse(orderSchema, data);
  },

  /** The manager moves an order before another one, or last (RG-FIL-02). */
  async reorder(queue: QueueName, move: QueueMove): Promise<void> {
    await apiRequest(`/queues/${queue}/reorder`, { method: 'POST', body: move });
  },

  /** Marked priority, behind the other priorities; unmarked, it keeps its place (RG-FIL-02). */
  async priority(queue: QueueName, change: QueuePriority): Promise<void> {
    await apiRequest(`/queues/${queue}/priority`, { method: 'POST', body: change });
  },
};
