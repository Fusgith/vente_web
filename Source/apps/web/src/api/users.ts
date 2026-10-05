import {
  activationCodeSchema,
  userAccountListSchema,
  userAccountSchema,
  type ActivationCode,
  type CreateUserBody,
  type UpdateUserBody,
  type UserAccount,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The accounts, managed by the admin (T-016, annexe B, RG-USR-06). */
export const usersApi = {
  async list(): Promise<UserAccount[]> {
    return parseResponse(userAccountListSchema, await apiRequest('/users')).users;
  },
  async create(body: CreateUserBody): Promise<UserAccount> {
    return parseResponse(userAccountSchema, await apiRequest('/users', { method: 'POST', body }));
  },
  async update(id: string, body: UpdateUserBody): Promise<UserAccount> {
    return parseResponse(
      userAccountSchema,
      await apiRequest(`/users/${id}`, { method: 'PATCH', body }),
    );
  },
  // The secrets, set apart from the account: the admin sets them, never reads them (H20).
  async setPin(id: string, pin: string): Promise<void> {
    await apiRequest(`/users/${id}/pin`, { method: 'PUT', body: { pin } });
  },
  async setPassword(id: string, password: string): Promise<void> {
    await apiRequest(`/users/${id}/password`, { method: 'PUT', body: { password } });
  },
  /** The owner's one-time code: they choose their password with it (RG-USR-10). */
  async activationCode(id: string): Promise<ActivationCode> {
    return parseResponse(
      activationCodeSchema,
      await apiRequest(`/users/${id}/activation-code`, { method: 'POST' }),
    );
  },
  async unlock(id: string): Promise<void> {
    await apiRequest(`/users/${id}/unlock`, { method: 'POST' });
  },
  async resetTotp(id: string): Promise<void> {
    await apiRequest(`/users/${id}/totp`, { method: 'DELETE' });
  },
  async closeSessions(id: string): Promise<void> {
    await apiRequest(`/users/${id}/sessions`, { method: 'DELETE' });
  },
};
