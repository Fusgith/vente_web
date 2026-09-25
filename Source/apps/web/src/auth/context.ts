import type { AuthMe, LoginBody, Role } from '@vente-web/shared';
import { createContext, use } from 'react';

import { ApiError } from '../api/client.js';

/** Who to preselect on the login screen after an idle lock. */
export interface ResumeHint {
  username: string;
  role: Role;
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; notice: string | null; resume: ResumeHint | null }
  | { status: 'authenticated'; me: AuthMe };

export interface AuthContextValue {
  state: AuthState;
  /** Rejects with an `ApiError` the login screen shows. */
  signIn(body: LoginBody): Promise<void>;
  signOut(): Promise<void>;
  lock(): void;
  /** Rejects with an `ApiError`; a lost session also sends the user back to the login screen. */
  switchRole(role: Role): Promise<void>;
  /** Called on user activity; pings the server at most once a minute. */
  keepAlive(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

/** Codes meaning the session is gone: back to the login screen, with the reason. */
const SESSION_LOST_CODES = new Set([
  'AUTH_REQUIRED',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_IDLE',
  'AUTH_ORIGIN_MISMATCH',
]);

export function isSessionLost(error: unknown): error is ApiError {
  return error instanceof ApiError && SESSION_LOST_CODES.has(error.code);
}
