import {
  formatMga,
  formatQty,
  formatTime,
  ticketLabel,
  type IssueEntry,
  type Order,
} from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { deliveriesApi } from '../api/deliveries.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';

const text = labels.issues;

const named = (order: Order) =>
  [order.ticket ? ticketLabel(order.ticket) : order.number, order.customer.name] as const;

/** One issue: what was not handed over and why; then the decision, or the credit to refund. */
function Issue({
  entry,
  busy,
  onDecide,
}: {
  entry: IssueEntry;
  busy: boolean;
  onDecide: (entry: IssueEntry, decision: 'requeue' | 'deliverPartly') => void;
}) {
  const { order, issue } = entry;
  const [ticket, name] = named(order);
  return (
    <li className="flex flex-col gap-2 border-b border-rule px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-21 font-bold">
          {ticket} — {name}
        </h3>
        <span className="text-ink-2">
          {text.reportedBy(issue.reportedBy, formatTime(issue.reportedAt))}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {issue.lines.map((line) => {
          const ordered = order.lines.find((candidate) => candidate.position === line.position);
          return (
            <li key={line.position} className="figures">
              {text.line(
                formatQty(line.qty),
                ordered?.unitLabel ?? '',
                ordered?.name ?? '',
                text.causes[line.cause],
              )}
            </li>
          );
        })}
      </ul>
      {issue.note && <p className="text-ink-2 italic">« {issue.note} »</p>}
      {issue.credit ? (
        <p className="font-semibold figures">
          {text.pendingCredit(formatMga(issue.credit.amount))}
        </p>
      ) : (
        <>
          <p className="text-14 text-ink-2">{text.waitHelp}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(entry, 'requeue')}
              aria-label={`${text.requeue} ${ticket}`}
              className={buttonClass('secondary', 'lg')}
            >
              {text.requeue}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(entry, 'deliverPartly')}
              aria-label={`${text.deliverPartly} ${ticket}`}
              className={buttonClass('primary', 'lg')}
            >
              {busy ? text.deciding : text.deliverPartly}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/**
 * The manager's delivery issues (RG-LIV-04, H37): each order waiting on a decision — back
 * in the queue at its place, or delivered in part; doing nothing lets it wait, its goods kept —
 * then the credits still to refund at the register. Told live of each new one.
 */
export function DeliveryIssuesPanel() {
  const { say, sayError } = useStatusLine();
  const [entries, setEntries] = useState<IssueEntry[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only the latest request answers: a slow earlier one never brings back an older list.
  const latest = useRef(0);
  const load = useCallback(() => {
    const request = ++latest.current;
    return deliveriesApi.issues().then(
      (list) => {
        if (request !== latest.current) return null;
        setEntries(list);
        setFailure(null);
        return list;
      },
      (error: unknown) => {
        if (request === latest.current) setFailure(errorMessage(error));
        return null;
      },
    );
  }, []);
  useEffect(() => {
    void load();
    return () => {
      latest.current += 1;
    };
  }, [load]);
  useRealtimeConnect(() => void load());
  useRealtimeEvent('order.status_changed', ({ orderId, status }) => {
    void load().then((list) => {
      const found = list?.find((entry) => entry.order.id === orderId);
      if (status === 'ISSUE' && found) say(text.newIssue(...named(found.order)), 'alert');
    });
  });

  const decide = (entry: IssueEntry, decision: 'requeue' | 'deliverPartly') => {
    setBusy(true);
    deliveriesApi[decision](entry.order.id, entry.order.version)
      .then(
        (order) =>
          say(
            (decision === 'requeue' ? text.requeued : text.partlyDelivered)(...named(order)),
            'check',
          ),
        (error: unknown) => sayError(errorMessage(error)),
      )
      .finally(() => {
        setBusy(false);
        void load();
      });
  };

  return (
    <section
      aria-labelledby="delivery-issues"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden`}
    >
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <h2 id="delivery-issues" className="type-title">
          {text.panelTitle}
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          className={buttonClass('secondary', 'md')}
        >
          {text.refresh}
        </button>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {entries?.length === 0 && <p className="px-4 pb-4 text-ink-2">{text.none}</p>}
      {entries && entries.length > 0 && (
        <ul className="border-t border-rule">
          {entries.map((entry) => (
            <Issue key={entry.issue.id} entry={entry} busy={busy} onDecide={decide} />
          ))}
        </ul>
      )}
    </section>
  );
}
