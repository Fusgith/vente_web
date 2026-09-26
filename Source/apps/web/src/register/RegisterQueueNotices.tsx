import { ticketLabel } from '@vente-web/shared';

import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';

/**
 * The cashiers are told of each order entering their queue (RG-CMD-03): the event names the
 * order, which is read again through the API before its ticket and customer are shown
 * (RG-TKT-03). The queue itself, its calls and its order come with T-040.
 */
export function RegisterQueueNotices() {
  const { say } = useStatusLine();
  useRealtimeEvent('queue.changed', ({ queue, orderId, change }) => {
    // Only an order entering: one back after an absence is no news (RG-FIL-04).
    if (queue !== 'register' || change !== 'entered') return;
    ordersApi.get(orderId).then(
      (order) => {
        if (order.status !== 'SUBMITTED' || !order.ticket) return;
        say(labels.register.newOrder(ticketLabel(order.ticket), order.customer.name), 'info');
      },
      // An order the API no longer shows is no news.
      () => undefined,
    );
  });
  return null;
}
