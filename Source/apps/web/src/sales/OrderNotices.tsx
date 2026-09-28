import { ticketLabel, type Order } from '@vente-web/shared';

import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';

/**
 * What the salesperson's tablet hears of their orders, each read again first: without a public
 * display, a ticket called to the register, to tell the customer (RG-DSP-05); an order expired
 * unpaid at the day end, its stock freed (RG-CMD-08).
 */
export function OrderNotices() {
  const { say } = useStatusLine();
  const tell = (orderId: string, message: (ticket: string, order: Order) => string) => {
    ordersApi.get(orderId).then(
      (order) => {
        if (order.ticket) say(message(ticketLabel(order.ticket), order), 'info');
      },
      () => undefined,
    );
  };
  useRealtimeEvent('ticket.called', ({ orderId }) =>
    tell(orderId, (ticket, order) => labels.sales.called(ticket, order.customer.name)),
  );
  useRealtimeEvent('order.status_changed', ({ orderId, status }) => {
    if (status === 'EXPIRED') {
      tell(orderId, (ticket, order) => labels.sales.expired(ticket, order.customer.name));
    }
  });
  return null;
}
