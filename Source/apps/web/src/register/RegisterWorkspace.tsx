import { ticketLabel, type Order, type QueueItem } from '@vente-web/shared';
import { useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { queuesApi } from '../api/queues.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { QueueTable } from './QueueTable.js';
import { RegisterQueueNotices } from './RegisterQueueNotices.js';
import { ServingPanel } from './ServingPanel.js';
import { useNow, useRegisterQueue } from './useRegisterQueue.js';

const text = labels.register;

/** How often the waits shown move on. */
const CLOCK_MS = 30_000;

/**
 * The cashier's screen (T-040): the register queue live on one side, this register's customer on
 * the other — called, announced, or sent back to the queue when absent (RG-FIL-01 à 04). The
 * control of the order and its payment come with T-050 and T-051.
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

  async function act(action: () => Promise<Order>, done: (order: Order) => string) {
    setBusy(true);
    try {
      say(done(await action()), 'check');
    } catch (failure) {
      sayError(errorMessage(failure));
    } finally {
      setBusy(false);
      refresh();
    }
  }
  const announced = (order: Order) =>
    order.ticket ? text.called(ticketLabel(order.ticket), order.customer.name) : '';

  return (
    <div className="flex flex-1 flex-col gap-4 md:min-h-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <h1 className="sr-only">{labels.workspaces.cashier.title}</h1>
      <RegisterQueueNotices />
      {error && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder lg:col-span-2"
        >
          {error}
        </p>
      )}
      <QueueTable
        waiting={waiting}
        now={now}
        callable={!mine && !busy}
        onCall={(item: QueueItem) => void act(() => queuesApi.call(item.orderId), announced)}
      />
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
    </div>
  );
}
