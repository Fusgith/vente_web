import { supervisionTodaySchema, type SupervisionToday } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The manager's day at a glance (T-042, RG-DSP-04). */
export const supervisionApi = {
  async today(): Promise<SupervisionToday> {
    return parseResponse(supervisionTodaySchema, await apiRequest('/supervision/today'));
  },
};
