import { REALTIME_PATH, type AuthMe } from '@vente-web/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import { io } from 'socket.io-client';

import { RealtimeContext } from './context.js';

interface RealtimeProviderProps {
  me: AuthMe;
  /** Off in the design gallery, which runs without a server. */
  enabled?: boolean;
  children: ReactNode;
}

/**
 * One realtime connection per signed-in shell (T-018): same origin, WebSocket only, the session
 * cookie as sole credential. A role switch joins other rooms, so it connects again; signing
 * out or locking unmounts the shell and closes it. Socket.IO reconnects by itself after a
 * network drop, never after the server refused the session.
 */
export function RealtimeProvider({ me, enabled = true, children }: RealtimeProviderProps) {
  const identity = `${me.user.id}:${me.session.activeRole}`;
  // Built idle (no network until `connect`), one per identity: a new role, a new connection.
  const socket = useMemo(
    () =>
      enabled ? io({ path: REALTIME_PATH, transports: ['websocket'], autoConnect: false }) : null,
    // The rooms are the session's: another user or role needs its own connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, identity],
  );

  useEffect(() => {
    if (!socket) return;
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return <RealtimeContext value={socket}>{children}</RealtimeContext>;
}
