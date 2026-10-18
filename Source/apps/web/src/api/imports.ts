import {
  importDetailSchema,
  importListSchema,
  type ImportDetail,
  type ImportList,
  type ImportUpload,
} from '@vente-web/shared';

import { API_BASE, apiRequest, parseResponse } from './client.js';

const detail = async (data: unknown) => parseResponse(importDetailSchema, data);

/** Catalog import from Excel (T-020; RG-IMP-01 à 08). */
export const importsApi = {
  templateUrl: `${API_BASE}/imports/template`,
  async list(): Promise<ImportList> {
    return parseResponse(importListSchema, await apiRequest('/imports'));
  },
  async get(id: string): Promise<ImportDetail> {
    return detail(await apiRequest(`/imports/${id}`));
  },
  async upload(body: ImportUpload): Promise<ImportDetail> {
    return detail(await apiRequest('/imports', { method: 'POST', body }));
  },
  async commit(id: string, validOnly: boolean): Promise<ImportDetail> {
    return detail(
      await apiRequest(`/imports/${id}/commit`, { method: 'POST', body: { validOnly } }),
    );
  },
  async cancel(id: string): Promise<ImportDetail> {
    return detail(await apiRequest(`/imports/${id}/cancel`, { method: 'POST' }));
  },
};

/** The file's bytes as base64, as the upload carries them. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(file);
  });
}
