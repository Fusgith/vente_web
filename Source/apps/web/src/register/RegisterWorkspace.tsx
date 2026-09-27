import { ticketLabel, type Order, type QueueItem, type QuoteLine } from '@vente-web/shared';
import { useState } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { queuesApi } from '../api/queues.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { OrderControl } from './OrderControl.js';
import { QueueSummary } from './QueueSummary.js';
import { QueueTable } from './QueueTable.js';
import { RegisterQueueNotices } from './RegisterQueueNotices.js';
import { ServingPanel } from './ServingPanel.js';
import { useOrderAtRegister } from './useOrderAtRegister.js';
import { useNow, useRegisterQueue } from './useRegisterQueue.js';

const text = labels.register;

/** How often the waits shown move on. */
const CLOCK_MS = 30_000;

/**
 * The cashier's screen. Without a customer: the register queue live, and the call of the next
 * ticket (T-040, RG-FIL-01 à 04). With one: their order checked line by line — lowered, removed,
 * or cancelled with a reason (T-050, RG-CMD-05b, RG-ANN-01) — beside the ticket to announce and
 * the queue in short. The payment comes with T-051.
 */
export function RegisterWorkspace({ userId }: { userId: string }) {
  const { queue, error, refresh } = useRegisterQueue();
  const { say, sayError } = useStatusLine();
  const [busy, setBusy] = useState(false);
  const now = useNow(CLOCK_MS);

  const waiting = queue?.waiting ?? [];
  const serving = queue?.serving ?? [];
  const mine = serving.find((item) => item.servedBy?.id === userId) ?? null;
  const elsewhere = serving.filter((item) => item !== mine);
  const atRegister = useOrderAtRegister(mine?.orderId ?? null);

  /** Runs an action, says its outcome; true when it went through. */
  async function act(action: () => Promise<Order>, done: (order: Order) => string) {
    setBusy(true);
    try {
      const order = await action();
      if (order.status === 'AT_REGISTER') atRegister.replace(order);
      say(done(order), 'check');
      return true;
    } catch (failure) {
      sayError(errorMessage(failure));
      // Changed meanwhile elsewhere: the screen shows it as it now is.
      if (failure instanceof ApiError && failure.code === 'ORDER_CHANGED' && mine) {
        atRegister.replace(await ordersApi.get(mine.orderId));
      }
      return false;
    } finally {
      setBusy(false);
      refresh();
    }
  }
  const announced = (order: Order) =>
    order.ticket ? text.called(ticketLabel(order.ticket), order.customer.name) : '';
  const adjust = (line: QuoteLine, qty: string | null) => {
    const order = atRegister.order;
    if (!order) return Promise.resolve(false);
    return act(
      () => ordersApi.adjust(order.id, order.version, [{ position: line.position, qty }]),
      () => (qty === null ? text.removed(line.position) : text.adjusted(line.position)),
    );
  };

  const servingPanel = (
    <ServingPanel
      mine={mine}
      next={waiting[0] ?? null}
      elsewhere={elsewhere}
      busy={busy}
      onCallNext={() => void act(() => queuesApi.callNext(), announced)}
      onNoShow={(item) =>
        void act(
          () => queuesApi.noShow(item.orderId),
          () => text.absent(ticketLabel(item.ticket)),
        )
      }
    />
  );

  const alert = error ?? atRegister.error;
  return (
    <div className="flex flex-1 flex-col gap-4 md:min-h-0">
      <h1 className="sr-only">{labels.workspaces.cashier.title}</h1>
      <RegisterQueueNotices />
      {alert && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {alert}
        </p>
      )}
      {mine ? (
        // Portrait: the ticket to announce, the order, then the queue; landscape: the order on
        // the left, the ticket and the queue on the right.
        <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col lg:col-start-2 lg:row-start-1">{servingPanel}</div>
          <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {atRegister.order ? (
              <OrderControl
                order={atRegister.order}
                busy={busy}
                onLower={(line, qty) => adjust(line, qty)}
                onRemove={(line) => adjust(line, null)}
                onCancel={(reason) => {
                  const order = atRegister.order;
                  if (!order) return Promise.resolve(false);
                  return act(
                    () => ordersApi.cancel(order.id, order.version, reason),
                    () => text.cancelled(ticketLabel(mine.ticket)),
                  );
                }}
              />
            ) : (
              <p className="m-auto text-ink-2">{text.loadingOrder}</p>
            )}
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <QueueSummary waiting={waiting} now={now} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <QueueTable
            waiting={waiting}
            now={now}
            callable={!busy}
            onCall={(item: QueueItem) => void act(() => queuesApi.call(item.orderId), announced)}
          />
          <div className="order-first flex min-w-0 flex-col lg:order-none">{servingPanel}</div>
        </div>
      )}
    </div>
  );
}
