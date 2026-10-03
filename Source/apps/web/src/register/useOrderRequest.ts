import { ticketLabel, type Order, type QueueItem } from '@vente-web/shared';
import { useEffect, useRef } from 'react';

import { ApiError } from '../api/client.js';
import { discountRequestsApi, requestPending } from '../api/discount-requests.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import type { RequestInput } from '../sales/useQuoteActions.js';
import { useStatusLine } from '../shell/status-line.js';

const text = labels.requests;
/** A refusal that may hide a request gone through (its answer lost) or one made meanwhile. */
const UNSURE = new Set(['NETWORK_ERROR', 'ORDER_CHANGED', 'DISCOUNT_REQUEST_PENDING']);

interface OrderRequestDeps {
  /** The customer at this register, and their order as read. */
  mine: QueueItem | null;
  /** Those waiting in the queue: the orders set aside among them. */
  waiting: readonly QueueItem[];
  order: Order | null;
  replace: (order: Order) => void;
  /** The register's way of running an action: busy meanwhile, its outcome said, the queue read. */
  act: (action: () => Promise<Order>, done: (order: Order) => string) => Promise<boolean>;
  setBusy: (busy: boolean) => void;
  refresh: () => void;
}

/**
 * A discount asked of the owner from the register (T-033d, H51), then, while the owner decides,
 * withdrawn with the customer's agreement or the order set aside in the queue at its place
 * (RG-REM-05, H52, H54). The answer, read with the order when it changes, is told in the band.
 */
export function useOrderRequest({
  mine,
  waiting,
  order,
  replace,
  act,
  setBusy,
  refresh,
}: OrderRequestDeps) {
  const { say } = useStatusLine();
  /** The request this register withdrew: already told by its own action. */
  const withdrawnHere = useRef<string | null>(null);
  const shown = useRef<{ orderId: string; id: string; status: string } | null>(null);

  // The order read again after the owner's answer (or the expiry, or a withdrawal elsewhere):
  // the request seen pending is now closed, which the cashier is told.
  useEffect(() => {
    const request = order?.discountRequest ?? null;
    const before = shown.current;
    shown.current =
      order && request ? { orderId: order.id, id: request.id, status: request.status } : null;
    if (!order || !request || request.status === 'PENDING') return;
    if (before?.orderId !== order.id || before.id !== request.id || before.status !== 'PENDING') {
      return;
    }
    if (request.status === 'WITHDRAWN' && withdrawnHere.current === request.id) return;
    say(
      request.status === 'GRANTED'
        ? text.decided.GRANTED(order.discountCode?.code ?? '')
        : text.decided[request.status],
      'info',
    );
  }, [order, say]);

  // An order set aside, waiting in the queue: its answer is told by its ticket, the cashier who
  // calls it then knows (H53). The one held here is told above, with the order read again.
  useRealtimeEvent('discount.request_decided', ({ orderId, status }) => {
    const item = waiting.find((one) => one.orderId === orderId);
    if (item) say(text.decidedOrder(ticketLabel(item.ticket), item.customer.name, status), 'info');
  });

  /**
   * The request from its sheet: null once sent (the band says so), else why it was refused. The
   * answer lost on the Wi-Fi may hide a request that went through: the order read again tells.
   */
  async function ask(request: RequestInput): Promise<string | null> {
    const sent = order;
    if (!sent) return labels.errors.UNEXPECTED_RESPONSE;
    setBusy(true);
    try {
      replace(
        await discountRequestsApi.create({ orderId: sent.id, version: sent.version, ...request }),
      );
      say(text.sent, 'check');
      return null;
    } catch (failure) {
      if (failure instanceof ApiError && UNSURE.has(failure.code)) {
        const again = await ordersApi.get(sent.id).catch(() => null);
        if (again?.status === 'AT_REGISTER') replace(again);
        if (failure.code === 'NETWORK_ERROR' && again && requestPending(again.discountRequest)) {
          say(text.sent, 'check');
          return null;
        }
      }
      return errorMessage(failure);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  /** Withdrawn with the customer's agreement (H54): paid within the caps. */
  const withdraw = () => {
    const request = order?.discountRequest;
    if (!request) return;
    withdrawnHere.current = request.id;
    void act(
      () => discountRequestsApi.withdraw(request.id),
      () => text.withdrawn,
    );
  };

  /** Back among those waiting, at its place, while the owner decides (H52). */
  const setAside = () => {
    if (!order || !mine) return;
    const ticket = ticketLabel(mine.ticket);
    void act(
      () => discountRequestsApi.setAside(order.id),
      () => text.setAsideDone(ticket),
    );
  };

  return { ask, withdraw, setAside };
}
