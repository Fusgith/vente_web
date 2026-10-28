import { licenseStatusSchema, type LicenseStatus } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The server's trial license (T-101, ADR-0010): read and entered without an account. */
export const licenseApi = {
  async status(): Promise<LicenseStatus> {
    return parseResponse(licenseStatusSchema, await apiRequest('/license'));
  },
  async enter(key: string): Promise<LicenseStatus> {
    return parseResponse(
      licenseStatusSchema,
      await apiRequest('/license', { method: 'POST', body: { key } }),
    );
  },
};
