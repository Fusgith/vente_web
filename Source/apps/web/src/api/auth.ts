import {
  authMeSchema,
  authUserDirectorySchema,
  type AuthMe,
  type AuthUserDirectory,
  type LoginBody,
  type Role,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** Endpoints of T-012 (CDC technique §6, `auth`). */
export const authApi = {
  async me(signal?: AbortSignal): Promise<AuthMe> {
    return parseResponse(authMeSchema, await apiRequest('/auth/me', signal ? { signal } : {}));
  },

  /** Names to pick on a shared station; answers AUTH_LAN_ONLY outside the shop. */
  async users(signal?: AbortSignal): Promise<AuthUserDirectory> {
    const data = await apiRequest('/auth/users', signal ? { signal } : {});
    return parseResponse(authUserDirectorySchema, data);
  },

  async login(body: LoginBody): Promise<AuthMe> {
    return parseResponse(authMeSchema, await apiRequest('/auth/login', { method: 'POST', body }));
  },

  async logout(): Promise<void> {
    await apiRequest('/auth/logout', { method: 'POST' });
  },

  async switchRole(role: Role): Promise<AuthMe> {
    const data = await apiRequest('/auth/switch-role', { method: 'POST', body: { role } });
    return parseResponse(authMeSchema, data);
  },
};
