import { ticketLabel } from '@vente-web/shared';

import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';

/**
 * Without a public display the call is verbal: the salesperson's tablet hears when one of their
 * tickets is called, to tell the customer (RG-DSP-05). The order is read again first.
 */
export function CallNotices() {
  const { say } = useStatusLine();
  useRealtimeEvent('ticket.called', ({ orderId }) => {
    ordersApi.get(orderId).then(
      (order) => {
        if (order.ticket)
          say(labels.sales.called(ticketLabel(order.ticket), order.customer.name), 'info');
      },
      () => undefined,
    );
  });
  return null;
}
