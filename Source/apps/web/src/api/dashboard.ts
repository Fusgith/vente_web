import { dashboardSchema, type Dashboard, type DashboardQuery } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The owner's dashboard (T-070, RG-DSH-01 à 04). */
export const dashboardApi = {
  async read({ from, to }: DashboardQuery): Promise<Dashboard> {
    const query = new URLSearchParams({ from, to });
    return parseResponse(dashboardSchema, await apiRequest(`/dashboard?${query}`));
  },
};
