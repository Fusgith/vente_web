import {
  userAccountListSchema,
  userAccountSchema,
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
};
