import type { Queue } from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { queuesApi } from '../api/queues.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';

/**
 * The register queue, read again whenever it changes (`queue.changed`) or the realtime channel
 * comes back: an event is only a hint, the API says what the queue is (CDC technique §6.1).
 * A slower, older answer never replaces a newer one.
 */
export function useRegisterQueue() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const refresh = useCallback(() => {
    const request = ++latest.current;
    queuesApi.get('register').then(
      (next) => {
        if (request !== latest.current) return;
        setQueue(next);
        setError(null);
      },
      (failure: unknown) => {
        if (request === latest.current) setError(errorMessage(failure));
      },
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useRealtimeEvent('queue.changed', ({ queue: changed }) => {
    if (changed === 'register') refresh();
  });
  useRealtimeConnect(refresh);

  return { queue, error, refresh };
}

/** The current time, again every `intervalMs`: the waits shown keep running (RG-FIL-05). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
