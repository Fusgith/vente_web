import type { Order } from '@vente-web/shared';
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { useRealtimeEvent } from '../realtime/context.js';

interface Loaded {
  orderId: string;
  order: Order | null;
  error: string | null;
}

/**
 * The full order at this register (lines, discounts, totals), read when the customer is called
 * and again whenever someone else changes it; after this register's own change, the API's answer
 * replaces it directly.
 */
export function useOrderAtRegister(orderId: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = useCallback((id: string) => {
    ordersApi.get(id).then(
      (order) => setLoaded({ orderId: id, order, error: null }),
      (failure: unknown) => setLoaded({ orderId: id, order: null, error: errorMessage(failure) }),
    );
  }, []);

  useEffect(() => {
    if (orderId) load(orderId);
  }, [orderId, load]);
  useRealtimeEvent('queue.changed', (event) => {
    if (orderId && event.orderId === orderId && event.change === 'updated') load(orderId);
  });

  const current = loaded && loaded.orderId === orderId ? loaded : null;
  const replace = useCallback((order: Order) => {
    setLoaded({ orderId: order.id, order, error: null });
  }, []);
  return { order: current?.order ?? null, error: current?.error ?? null, replace };
}
