import { ticketLabel, type Order } from '@vente-web/shared';

import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';

/**
 * What the salesperson's tablet hears of their orders, each read again first: without a public
 * display, a ticket called to the register, to tell the customer (RG-DSP-05); an order expired
 * unpaid at the day end, its stock freed (RG-CMD-08); the owner's answer to a discount asked on
 * an order in the queue (H53), or the request's end — unless the order expired with it (H54).
 */
export function OrderNotices() {
  const { say } = useStatusLine();
  const tell = (orderId: string, message: (ticket: string, order: Order) => string | null) => {
    ordersApi.get(orderId).then(
      (order) => {
        const told = order.ticket && message(ticketLabel(order.ticket), order);
        if (told) say(told, 'info');
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
  useRealtimeEvent('discount.request_decided', ({ orderId, status }) => {
    tell(orderId, (ticket, order) =>
      order.status === 'EXPIRED'
        ? null
        : labels.requests.decidedOrder(ticket, order.customer.name, status),
    );
  });
  return null;
}
