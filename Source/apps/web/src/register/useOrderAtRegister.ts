import type { Order } from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';

interface Loaded {
  orderId: string;
  order: Order | null;
  error: string | null;
}

/**
 * The full order at this register (lines, discounts, totals), read when the customer is called
 * and again whenever someone else changes it or the channel comes back (events missed meanwhile);
 * after this register's own change, the API's answer replaces it directly. Only the latest read
 * counts: an older answer arriving late never shows over a newer one.
 */
export function useOrderAtRegister(orderId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const latest = useRef(0);

  const load = useCallback((id: string) => {
    latest.current += 1;
    const read = latest.current;
    const settle = (next: Loaded) => {
      if (read === latest.current) setLoaded(next);
    };
    ordersApi.get(id).then(
      (order) => settle({ orderId: id, order, error: null }),
      (failure: unknown) => settle({ orderId: id, order: null, error: errorMessage(failure) }),
    );
  }, []);

  useEffect(() => {
    if (orderId) load(orderId);
  }, [orderId, load]);
  useRealtimeEvent('queue.changed', (event) => {
    if (orderId && event.orderId === orderId && event.change === 'updated') load(orderId);
  });
  useRealtimeConnect(() => {
    if (orderId) load(orderId);
  });

  const current = loaded && loaded.orderId === orderId ? loaded : null;
  const replace = useCallback((order: Order) => {
    latest.current += 1;
    setLoaded({ orderId: order.id, order, error: null });
  }, []);
  return { order: current?.order ?? null, error: current?.error ?? null, replace };
}
