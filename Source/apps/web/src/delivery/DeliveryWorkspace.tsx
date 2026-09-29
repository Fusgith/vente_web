import { ticketLabel, type Order, type QueueItem } from '@vente-web/shared';
import { useState } from 'react';

import { ApiError } from '../api/client.js';
import { deliveriesApi } from '../api/deliveries.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { labels } from '../labels.js';
import { QueueSummary } from '../register/QueueSummary.js';
import { QueueTable, type QueueTableText } from '../register/QueueTable.js';
import { useOrderAtRegister } from '../register/useOrderAtRegister.js';
import { useNow, useQueue } from '../register/useQueue.js';
import { useStatusLine } from '../shell/status-line.js';
import { CounterPanel } from './CounterPanel.js';
import { DeliveryQueueNotices } from './DeliveryQueueNotices.js';
import { HandOver } from './HandOver.js';
import { IssueSheet } from './IssueSheet.js';

const text = labels.delivery;

/** How often the waits shown move on. */
const CLOCK_MS = 30_000;

const WORDING: QueueTableText = {
  id: 'delivery-queue',
  title: text.queueTitle,
  empty: text.empty,
  actionShort: text.takeShort,
  action: text.take,
};

/**
 * The warehouse user's screen (T-060, RG-LIV-01 à 03, H34). Without an order: the delivery
 * queue live, the next one taken, or a ticket out of turn. With one: what to prepare, then —
 * called — each line ticked as handed over, and the delivery; absent, back to the queue.
 */
export function DeliveryWorkspace({ userId }: { userId: string }) {
  const { queue, error, refresh } = useQueue('delivery');
  const { say, sayError } = useStatusLine();
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState<{ orderId: string; lines: Set<number> } | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const now = useNow(CLOCK_MS);

  const waiting = queue?.waiting ?? [];
  const serving = queue?.serving ?? [];
  const mine = serving.find((item) => item.servedBy?.id === userId) ?? null;
  const elsewhere = serving.filter((item) => item !== mine);
  const atCounter = useOrderAtRegister(mine?.orderId ?? null);
  // The ticks belong to one hand-over: once the order leaves the counter (absent, released), a
  // later call starts from none (RG-LIV-03).
  if (ticked && (mine?.orderId !== ticked.orderId || mine.status !== 'READY')) setTicked(null);
  const lines = mine && ticked?.orderId === mine.orderId ? ticked.lines : new Set<number>();

  /** Runs an action, says its outcome; the queue is read again whatever happened. */
  async function act(action: () => Promise<Order>, done: (order: Order) => string) {
    setBusy(true);
    try {
      const order = await action();
      if (order.status === 'PREPARING' || order.status === 'READY') atCounter.replace(order);
      say(done(order), 'check');
    } catch (failure) {
      sayError(errorMessage(failure));
      // Changed meanwhile elsewhere: the screen shows it as it now is.
      if (failure instanceof ApiError && failure.code === 'ORDER_CHANGED' && mine) {
        ordersApi.get(mine.orderId).then(atCounter.replace, () => undefined);
      }
    } finally {
      setBusy(false);
      refresh();
    }
  }
  const named = (order: Order) =>
    [order.ticket ? ticketLabel(order.ticket) : order.number, order.customer.name] as const;

  const tick = (position: number) => {
    if (!mine) return;
    const next = new Set(lines);
    if (next.has(position)) next.delete(position);
    else next.add(position);
    setTicked({ orderId: mine.orderId, lines: next });
  };

  const panel = (
    <CounterPanel
      mine={mine}
      next={waiting[0] ?? null}
      elsewhere={elsewhere}
      busy={busy}
      onTakeNext={() => void act(deliveriesApi.takeNext, (order) => text.taken(...named(order)))}
      onNoShow={(item: QueueItem) =>
        void act(
          () => deliveriesApi.noShow(item.orderId),
          () => text.absent(ticketLabel(item.ticket), item.customer.name),
        )
      }
    />
  );

  const alert = error ?? atCounter.error;
  return (
    <div className="flex flex-1 flex-col gap-4 md:min-h-0">
      <h1 className="sr-only">{labels.workspaces.warehouse.title}</h1>
      <DeliveryQueueNotices />
      {alert && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {alert}
        </p>
      )}
      {mine ? (
        <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col lg:col-start-2 lg:row-start-1">{panel}</div>
          <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {atCounter.order ? (
              <HandOver
                order={atCounter.order}
                ticket={ticketLabel(mine.ticket)}
                ticked={mine.status === 'READY' ? lines : null}
                onTick={tick}
                busy={busy}
                onReady={() =>
                  void act(
                    () => deliveriesApi.ready(mine.orderId),
                    (order) => text.called(...named(order)),
                  )
                }
                onIssue={() => setReporting(mine.orderId)}
                onDeliver={() => {
                  const order = atCounter.order;
                  if (!order) return;
                  void act(
                    () => deliveriesApi.deliver(order.id, order.version, [...lines]),
                    (delivered) => text.delivered(...named(delivered)),
                  );
                }}
              />
            ) : (
              <p className="m-auto text-ink-2">{text.loadingOrder}</p>
            )}
            {atCounter.order && reporting === atCounter.order.id && (
              <IssueSheet
                order={atCounter.order}
                ticket={ticketLabel(mine.ticket)}
                onClose={() => setReporting(null)}
                onReported={(order) => {
                  setReporting(null);
                  say(labels.issues.reported(...named(order)), 'check');
                  refresh();
                }}
              />
            )}
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <QueueSummary waiting={waiting} now={now} title={text.queueTitle} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <QueueTable
            waiting={waiting}
            now={now}
            callable={!busy}
            wording={WORDING}
            showAmount={false}
            onCall={(item: QueueItem) =>
              void act(
                () => deliveriesApi.take(item.orderId),
                (order) => text.taken(...named(order)),
              )
            }
          />
          <div className="order-first flex min-w-0 flex-col lg:order-none">{panel}</div>
        </div>
      )}
    </div>
  );
}
