import { ticketLabel } from '@vente-web/shared';

import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';

/**
 * The manager hears of a customer absent twice or more (RG-FIL-04), to decide what to do with
 * the order; until the supervision view (T-042), in the bottom band.
 */
export function NoShowNotices() {
  const { say } = useStatusLine();
  useRealtimeEvent('order.no_show', ({ orderId, noShowCount }) => {
    ordersApi.get(orderId).then(
      (order) => {
        if (!order.ticket) return;
        say(
          labels.manager.noShows(ticketLabel(order.ticket), order.customer.name, noShowCount),
          'alert',
        );
      },
      () => undefined,
    );
  });
  return null;
}
