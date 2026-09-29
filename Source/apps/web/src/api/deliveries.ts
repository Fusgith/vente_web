import {
  issueEntrySchema,
  orderSchema,
  type DeliveryIssueReport,
  type IssueEntry,
  type Order,
} from '@vente-web/shared';

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
  /** A line missing or damaged (RG-LIV-04, H37): the manager decides. */
  reportIssue: (orderId: string, report: DeliveryIssueReport) =>
    post(`/orders/${orderId}/delivery/issue`, report),
  /** The manager's list: issues to decide, then credits still to refund. */
  async issues(): Promise<IssueEntry[]> {
    return parseResponse(issueEntrySchema.array(), await apiRequest('/deliveries/issues'));
  },
  requeue: (orderId: string, version: number) =>
    post(`/orders/${orderId}/issue/requeue`, { version }),
  deliverPartly: (orderId: string, version: number) =>
    post(`/orders/${orderId}/issue/deliver-partly`, { version }),
};
