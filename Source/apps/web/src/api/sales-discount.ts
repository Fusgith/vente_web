import { salesDiscountSchema } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** Whether the salesperson discounts (T-087, H60): read by everyone, set by the admin. */
export const salesDiscountApi = {
  async read(): Promise<boolean> {
    return (await parseResponse(salesDiscountSchema, await apiRequest('/sales-discount'))).enabled;
  },
  async set(enabled: boolean): Promise<boolean> {
    const reply = await apiRequest('/sales-discount', { method: 'PUT', body: { enabled } });
    return (await parseResponse(salesDiscountSchema, reply)).enabled;
  },
};
