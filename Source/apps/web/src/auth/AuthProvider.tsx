import type { AuthMe, LoginBody, Role } from '@vente-web/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import {
  AuthContext,
  isSessionLost,
  type AuthContextValue,
  type AuthState,
  type ResumeHint,
} from './context.js';

/**
 * The server drops a session after `idleMinutes` without requests, writing `last_seen_at` at
 * most once a minute (H19). A user who works without calling the API (reading, typing) is
 * still active: activity pings `/auth/me` at this pace so both clocks agree.
 */
export const KEEPALIVE_INTERVAL_MS = 60_000;

/** A user coming back to a locked screen only retypes the password (RG-USR-03, H57). */
function resumeHintOf(me: AuthMe): ResumeHint {
  return { username: me.user.username };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const lastContact = useRef(0);

  const authenticated = useCallback((me: AuthMe) => {
    lastContact.current = Date.now();
    setState({ status: 'authenticated', me });
  }, []);

  /** Ends the screen side of a session the server no longer knows; never resurrects one. */
  const sessionLost = useCallback((error: ApiError) => {
    setState((current) =>
      current.status === 'authenticated'
        ? { status: 'anonymous', notice: errorMessage(error), resume: resumeHintOf(current.me) }
        : current,
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    authApi.me(controller.signal).then(authenticated, (error: unknown) => {
      if (controller.signal.aborted) return;
      // No session is the normal start; an expired one says why.
      const quiet = error instanceof ApiError && error.code === 'AUTH_REQUIRED';
      setState({ status: 'anonymous', notice: quiet ? null : errorMessage(error), resume: null });
    });
    return () => controller.abort();
  }, [authenticated]);

  const signIn = useCallback(
    async (body: LoginBody) => authenticated(await authApi.login(body)),
    [authenticated],
  );

  const signOut = useCallback(async () => {
    setState({ status: 'anonymous', notice: null, resume: null });
    await authApi.logout().catch(() => undefined);
  }, []);

  /** Idle lock (RG-USR-03): the session is closed server-side, not just hidden. */
  const lock = useCallback(() => {
    setState((current) =>
      current.status === 'authenticated'
        ? {
            status: 'anonymous',
            notice: labels.session.locked(current.me.session.idleMinutes),
            resume: resumeHintOf(current.me),
          }
        : current,
    );
    void authApi.logout().catch(() => undefined);
  }, []);

  const switchRole = useCallback(
    async (role: Role) => {
      try {
        authenticated(await authApi.switchRole(role));
      } catch (error) {
        if (isSessionLost(error)) sessionLost(error);
        throw error;
      }
    },
    [authenticated, sessionLost],
  );

  const keepAlive = useCallback(() => {
    if (Date.now() - lastContact.current < KEEPALIVE_INTERVAL_MS) return;
    lastContact.current = Date.now();
    authApi.me().then(
      (me) =>
        setState((current) => (current.status === 'authenticated' ? { ...current, me } : current)),
      (error: unknown) => {
        if (isSessionLost(error)) sessionLost(error);
      },
    );
  }, [sessionLost]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signOut, lock, switchRole, keepAlive }),
    [state, signIn, signOut, lock, switchRole, keepAlive],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
