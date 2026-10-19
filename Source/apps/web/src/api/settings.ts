import { settingsSchema, type SettingKey, type Settings } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The « Paramètres » screen (T-013): read by the managers, each setting set by the admin. */
export const settingsApi = {
  async read(): Promise<Settings['values']> {
    return (await parseResponse(settingsSchema, await apiRequest('/settings'))).values;
  },
  async write(key: SettingKey, value: unknown): Promise<Settings['values']> {
    const reply = await apiRequest(`/settings/${key}`, { method: 'PUT', body: { value } });
    return (await parseResponse(settingsSchema, reply)).values;
  },
};
