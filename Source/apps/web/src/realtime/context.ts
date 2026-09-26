import { realtimePayloadSchemas, type RealtimeEvent, type RealtimeEvents } from '@vente-web/shared';
import { createContext, use, useEffect, useRef } from 'react';

/** What a screen needs of the connection: listening, and stopping. */
export interface RealtimeSource {
  on(event: string, listener: (payload: unknown) => void): unknown;
  off(event: string, listener: (payload: unknown) => void): unknown;
}

/** Null outside the signed-in shell, or while no connection is open. */
export const RealtimeContext = createContext<RealtimeSource | null>(null);

/**
 * Calls `handler` on each `event` of the realtime channel (CDC technique §6.1). A payload that
 * does not match its schema is ignored: the handler then reads the resource again through the
 * API, never trusting the event beyond its identifiers.
 */
export function useRealtimeEvent<E extends RealtimeEvent>(
  event: E,
  handler: (payload: RealtimeEvents[E]) => void,
): void {
  const source = use(RealtimeContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!source) return;
    const listener = (payload: unknown) => {
      const parsed = realtimePayloadSchemas[event].safeParse(payload);
      if (parsed.success) latest.current(parsed.data as RealtimeEvents[E]);
    };
    source.on(event, listener);
    return () => {
      source.off(event, listener);
    };
  }, [source, event]);
}
