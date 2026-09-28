import { formatAmount, ticketLabel, type QueueItem } from '@vente-web/shared';

import { labels } from '../labels.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { waitOf } from './wait.js';

const text = labels.register;

/** What a queue table says: the register's by default, the delivery's at the counters. */
export interface QueueTableText {
  id: string;
  title: string;
  empty: string;
  actionShort: string;
  action: (ticket: string) => string;
}

const REGISTER_TEXT: QueueTableText = {
  id: 'register-queue',
  title: text.queueTitle,
  empty: text.empty,
  actionShort: text.callShort,
  action: text.call,
};

const CELL = 'px-2 first:pl-4 last:pr-4';
const HEAD = `${CELL} h-12 border-b border-rule bg-white pb-1 align-bottom text-14 leading-5 font-semibold text-ink-2`;

interface QueueTableProps {
  waiting: QueueItem[];
  now: number;
  /** A ticket called out of turn: the customer stands at the register (RG-FIL-03). */
  onCall: (item: QueueItem) => void;
  /** No call while a customer is at this register, or while an action runs. */
  callable: boolean;
  wording?: QueueTableText;
  /** The amount to pay, at the register only (RG-FMT-01). */
  showAmount?: boolean;
}

/**
 * The register queue, in the order tickets will be called (RG-FIL-01): each with its customer's
 * name for the verbal call (RG-TKT-03), its amount — the sign once in the head (RG-FMT-01) —
 * and how long it has waited.
 */
export function QueueTable({
  waiting,
  now,
  onCall,
  callable,
  wording = REGISTER_TEXT,
  showAmount = true,
}: QueueTableProps) {
  return (
    <section
      aria-labelledby={wording.id}
      className={`${sheetClass} flex min-h-72 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0`}
    >
      <header className="flex shrink-0 items-baseline gap-3 px-4 pt-3 pb-2">
        <h2 id={wording.id} className="type-title">
          {wording.title}
        </h2>
        <span className="text-ink-2">{text.waitingCount(waiting.length)}</span>
      </header>
      {waiting.length === 0 ? (
        <p className="m-auto max-w-sm p-6 text-center text-ink-2">{wording.empty}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={`${HEAD} w-14`}>{text.rank}</th>
                <th className={`${HEAD} w-20`}>{text.ticket}</th>
                <th className={HEAD}>{text.customer}</th>
                <th className={`${HEAD} w-32`}>{text.salesUser}</th>
                {showAmount && (
                  <th className={`${HEAD} w-32 text-right`}>
                    {text.amount}{' '}
                    <span className="block font-normal">{labels.sales.draft.inCurrency}</span>
                  </th>
                )}
                <th className={`${HEAD} w-22 text-right`}>{text.wait}</th>
                <th className={`${HEAD} w-28`}>
                  <span className="sr-only">{wording.actionShort}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((item, index) => {
                const ticket = ticketLabel(item.ticket);
                const row = `${CELL} h-16 border-b border-rule py-1`;
                return (
                  <tr key={item.orderId}>
                    <td className={`${row} figures`}>{index + 1}</td>
                    <td className={`${row} text-21 font-bold figures`}>{ticket}</td>
                    <td className={`${row} leading-5`}>
                      <span className="block truncate font-semibold">{item.customer.name}</span>
                      {(item.priority || item.noShowCount > 0) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.priority && (
                            <span className={`${tagClass} border-saffron bg-saffron-soft text-ink`}>
                              {text.priority}
                            </span>
                          )}
                          {item.noShowCount > 0 && (
                            <span className={`${tagClass} border-madder text-madder`}>
                              {text.absences(item.noShowCount)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={`${row} truncate text-ink-2`}>{item.salesUser.fullName}</td>
                    {showAmount && (
                      <td className={`${row} text-right font-semibold figures`}>
                        {formatAmount(item.total)}
                      </td>
                    )}
                    <td className={`${row} text-right text-ink-2 figures`}>{waitOf(item, now)}</td>
                    <td className={row}>
                      <button
                        type="button"
                        onClick={() => onCall(item)}
                        disabled={!callable}
                        aria-label={wording.action(ticket)}
                        className={buttonClass('secondary', 'md', 'w-full px-2')}
                      >
                        {wording.actionShort}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
