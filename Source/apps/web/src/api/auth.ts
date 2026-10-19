import {
  authMeSchema,
  type ActivateBody,
  type AuthMe,
  type LoginBody,
  type Role,
} from '@vente-web/shared';

import { readStationKey } from '../station-key.js';
import { apiRequest, parseResponse } from './client.js';

/** Endpoints of T-012 (CDC technique §6, `auth`). */
export const authApi = {
  async me(signal?: AbortSignal): Promise<AuthMe> {
    return parseResponse(authMeSchema, await apiRequest('/auth/me', signal ? { signal } : {}));
  },

  /** A paired device names its station by its key (T-015, RG-USR-09). */
  async login(body: LoginBody): Promise<AuthMe> {
    const stationKey = readStationKey();
    const sent = stationKey ? { ...body, stationKey } : body;
    return parseResponse(
      authMeSchema,
      await apiRequest('/auth/login', { method: 'POST', body: sent }),
    );
  },

  async logout(): Promise<void> {
    await apiRequest('/auth/logout', { method: 'POST' });
  },

  async switchRole(role: Role): Promise<AuthMe> {
    const data = await apiRequest('/auth/switch-role', { method: 'POST', body: { role } });
    return parseResponse(authMeSchema, data);
  },

  /** The owner chooses their password with the admin's one-time code; no session opens (RG-USR-10). */
  async activate(body: ActivateBody): Promise<void> {
    await apiRequest('/auth/activate', { method: 'POST', body });
  },
};
