import { pushKeySchema } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The owner's devices told of each discount request, app closed (T-033e, RG-DSH-05). */
export const pushApi = {
  /** The server's VAPID public key; null: the shop has not set notifications up. */
  async key(): Promise<string | null> {
    return parseResponse(pushKeySchema, await apiRequest('/push/key')).publicKey;
  },
  /** This device, as its browser describes it; sent again at each opening. */
  async save(subscription: PushSubscriptionJSON): Promise<void> {
    await apiRequest('/push/subscription', { method: 'PUT', body: subscription });
  },
  async remove(endpoint: string): Promise<void> {
    await apiRequest('/push/subscription', { method: 'DELETE', body: { endpoint } });
  },
  /** One notification to this device, now. */
  async test(endpoint: string): Promise<void> {
    await apiRequest('/push/test', { method: 'POST', body: { endpoint } });
  },
};
