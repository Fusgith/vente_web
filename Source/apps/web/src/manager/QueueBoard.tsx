import {
  formatAmount,
  formatTime,
  ticketLabel,
  type QueueItem,
  type QueueName,
} from '@vente-web/shared';
import { useId, useState } from 'react';

import { deliveriesApi } from '../api/deliveries.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { queuesApi } from '../api/queues.js';
import { labels } from '../labels.js';
import { CancelOrderSheet } from '../register/CancelOrderSheet.js';
import { RequestTag } from '../register/RequestTag.js';
import { useQueue } from '../register/useQueue.js';
import { waitOf } from '../register/wait.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { rankAfter } from './queue-moves.js';
import { useRowDrag } from './useRowDrag.js';

const text = labels.supervision;
const columns = labels.register;

const CELL = 'px-2 first:pl-4 last:pr-4';
const HEAD = `${CELL} h-12 border-b border-rule bg-white pb-1 align-bottom text-14 leading-5 font-semibold text-ink-2`;
/** The drop line, above a row or below the last one. */
const LINE_ABOVE = '[&>td]:shadow-[inset_0_3px_0_0_var(--color-indigo)]';
const LINE_BELOW = '[&>td]:shadow-[inset_0_-3px_0_0_var(--color-indigo)]';

const named = (item: QueueItem) => [ticketLabel(item.ticket), item.customer.name] as const;

/** Who is being served: by whom, where, since when; at the counters, released by the manager. */
function Serving({
  queue,
  items,
  busy,
  onRelease,
}: {
  queue: QueueName;
  items: QueueItem[];
  busy: boolean;
  onRelease: (item: QueueItem) => void;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 pb-3">
      <h3 className="text-14 font-semibold text-ink-2">{text.serving[queue]}</h3>
      {items.length === 0 ? (
        <p className="text-ink-2">{text.servingNone}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const [ticket, name] = named(item);
            return (
              <li
                key={item.orderId}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-2 last:border-b-0"
              >
                <span className="w-16 text-21 font-bold figures">{ticket}</span>
                <span className="min-w-0 flex-1 leading-5">
                  <span className="block truncate font-semibold">{name}</span>
                  {/* At a register, its payment waiting for the owner's answer (RG-REM-05). */}
                  {item.discountPending && (
                    <span className="mt-1 flex">
                      <RequestTag />
                    </span>
                  )}
                  <span className="block text-ink-2">
                    {item.servedBy &&
                      text.servedBy(item.servedBy.fullName, item.station?.name ?? null)}
                    {item.calledAt && ` ${text.since(formatTime(item.calledAt))}`}
                  </span>
                </span>
                {queue === 'delivery' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRelease(item)}
                    aria-label={text.releaseOf(ticket)}
                    className={buttonClass('secondary', 'md')}
                  >
                    {text.release}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * One queue under the manager's eye (RG-DSP-04, RG-FIL-02): who is served, then who waits, in
 * the order they will be called — rank, ticket, customer, salesperson, amount, wait. Each waiting
 * order is dragged by its handle to another place, marked priority, or — at the register, not yet
 * paid — cancelled with its reason (RG-ANN-01). The API journals each change.
 */
export function QueueBoard({ queue, now }: { queue: QueueName; now: number }) {
  const { say, sayError } = useStatusLine();
  const { queue: shown, error, refresh } = useQueue(queue);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<QueueItem | null>(null);
  const hint = useId();
  const waiting = shown?.waiting ?? [];
  const ids = waiting.map((item) => item.orderId);

  const act = (run: () => Promise<unknown>, done: () => string) => {
    setBusy(true);
    return run()
      .then(
        () => {
          say(done(), 'check');
          return true;
        },
        (failure: unknown) => {
          sayError(errorMessage(failure));
          return false;
        },
      )
      .finally(() => {
        setBusy(false);
        refresh();
      });
  };

  const move = (orderId: string, beforeId: string | null) => {
    const item = waiting.find((candidate) => candidate.orderId === orderId);
    if (!item || busy) return;
    void act(
      () => queuesApi.reorder(queue, { orderId, beforeId }),
      () => text.moved(...named(item), rankAfter(ids, orderId, beforeId)),
    );
  };
  const drag = useRowDrag(ids, move);

  const togglePriority = (item: QueueItem) =>
    void act(
      () => queuesApi.priority(queue, { orderId: item.orderId, priority: !item.priority }),
      () => (item.priority ? text.unprioritized : text.prioritized)(...named(item)),
    );
  const release = (item: QueueItem) =>
    void act(
      () => deliveriesApi.release(item.orderId),
      () => text.released(...named(item)),
    );
  // The version is read at the moment of cancelling: the queue does not carry it.
  const cancel = (item: QueueItem, reason: string) =>
    void act(
      async () => {
        const order = await ordersApi.get(item.orderId);
        return ordersApi.cancel(order.id, order.version, reason);
      },
      () => columns.cancelled(...named(item)),
    ).then((done) => {
      if (done) setCancelling(null);
    });

  const titleId = `${queue}-board`;
  return (
    <section aria-labelledby={titleId} className={`${sheetClass} flex flex-col overflow-hidden`}>
      <header className="flex items-baseline gap-3 px-4 pt-3 pb-2">
        <h2 id={titleId} className="type-title">
          {text.queues[queue]}
        </h2>
        <span className="text-ink-2">{columns.waitingCount(waiting.length)}</span>
      </header>
      {error && (
        <p role="alert" className="px-4 pb-2 font-semibold text-madder">
          {error}
        </p>
      )}
      {shown && <Serving queue={queue} items={shown.serving} busy={busy} onRelease={release} />}
      <p id={hint} className="sr-only">
        {text.moveHelp}
      </p>
      {shown && waiting.length === 0 && <p className="px-4 pb-4 text-ink-2">{text.waitingNone}</p>}
      {waiting.length > 0 && (
        <div className="overflow-x-auto border-t border-rule">
          <table className="w-full min-w-[52rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={`${HEAD} w-16`}>
                  <span className="sr-only">{text.handle}</span>
                </th>
                <th className={`${HEAD} w-14`}>{columns.rank}</th>
                <th className={`${HEAD} w-20`}>{columns.ticket}</th>
                <th className={HEAD}>{columns.customer}</th>
                <th className={`${HEAD} w-36`}>{columns.salesUser}</th>
                <th className={`${HEAD} w-32 text-right`}>
                  {columns.amount}{' '}
                  <span className="block font-normal">{labels.sales.draft.inCurrency}</span>
                </th>
                <th className={`${HEAD} w-22 text-right`}>{columns.wait}</th>
                <th className={`${HEAD} w-56`}>
                  <span className="sr-only">{text.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((item, index) => {
                const [ticket] = named(item);
                const row = `${CELL} h-16 border-b border-rule py-1`;
                const line =
                  drag.slot === index
                    ? LINE_ABOVE
                    : drag.slot === waiting.length && index === waiting.length - 1
                      ? LINE_BELOW
                      : '';
                return (
                  <tr
                    key={item.orderId}
                    ref={drag.row(item.orderId)}
                    className={`${line} ${drag.dragged === item.orderId ? 'opacity-50' : ''}`}
                  >
                    <td className={row}>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={text.move(ticket)}
                        aria-describedby={hint}
                        {...drag.handle(item.orderId)}
                        className="flex size-12 cursor-grab touch-none items-center justify-center rounded-control text-ink-2 active:cursor-grabbing active:bg-indigo-soft disabled:opacity-50"
                      >
                        <Icon name="grip" />
                      </button>
                    </td>
                    <td className={`${row} figures`}>{index + 1}</td>
                    <td className={`${row} text-21 font-bold figures`}>{ticket}</td>
                    <td className={`${row} leading-5`}>
                      <span className="block truncate font-semibold">{item.customer.name}</span>
                      {(item.noShowCount > 0 || item.discountPending) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.noShowCount > 0 && (
                            <span className={`${tagClass} border-madder text-madder`}>
                              {columns.absences(item.noShowCount)}
                            </span>
                          )}
                          {/* The state of the discounts: a request awaits the owner (RG-DSP-04). */}
                          {item.discountPending && <RequestTag />}
                        </span>
                      )}
                    </td>
                    <td className={`${row} truncate text-ink-2`}>{item.salesUser.fullName}</td>
                    <td className={`${row} text-right font-semibold figures`}>
                      {formatAmount(item.total)}
                    </td>
                    <td className={`${row} text-right text-ink-2 figures`}>{waitOf(item, now)}</td>
                    <td className={row}>
                      <span className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          aria-pressed={item.priority}
                          aria-label={text.priorityOf(ticket)}
                          onClick={() => togglePriority(item)}
                          className={buttonClass(
                            'secondary',
                            'md',
                            'aria-pressed:border-saffron aria-pressed:bg-saffron-soft',
                          )}
                        >
                          {text.priority}
                        </button>
                        {queue === 'register' && (
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={text.cancelOf(ticket)}
                            onClick={() => setCancelling(item)}
                            className={buttonClass('destructive', 'md')}
                          >
                            <Icon name="trash" className="size-5" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cancelling && (
        <CancelOrderSheet
          ticket={ticketLabel(cancelling.ticket)}
          name={cancelling.customer.name}
          busy={busy}
          onCancel={(reason) => cancel(cancelling, reason)}
          onClose={() => setCancelling(null)}
        />
      )}
    </section>
  );
}
