import { ticketLabel } from '@vente-web/shared';

import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import { chime } from '../ui/chime.js';

/**
 * The counters are told of each order paid, entering their queue (RG-LIV-01): a chime, and its
 * ticket and customer in the band once the order is read again through the API (RG-TKT-03).
 */
export function DeliveryQueueNotices() {
  const { say } = useStatusLine();
  useRealtimeEvent('queue.changed', ({ queue, orderId, change }) => {
    // Only an order entering: one back after an absence is no news (RG-FIL-06).
    if (queue !== 'delivery' || change !== 'entered') return;
    ordersApi.get(orderId).then(
      (order) => {
        if (order.status !== 'PAID' || !order.ticket) return;
        chime();
        say(labels.delivery.newPaid(ticketLabel(order.ticket), order.customer.name), 'info');
      },
      // An order the API no longer shows is no news.
      () => undefined,
    );
  });
  return null;
}
