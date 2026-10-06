import { auditPageSchema, type AuditPage, type AuditQuery } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The audit log, read only (T-014, RG-AUD-01). */
export const auditApi = {
  async read(query: AuditQuery): Promise<AuditPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const search = params.size > 0 ? `?${params.toString()}` : '';
    return parseResponse(auditPageSchema, await apiRequest(`/audit${search}`));
  },
};
