import { ticketLabel, type QueueItem } from '@vente-web/shared';

import { labels } from '../labels.js';
import { sheetClass } from '../ui/button.js';
import { RequestTag } from './RequestTag.js';
import { waitOf } from './wait.js';

const text = labels.register;
/** Enough to see who comes next while a customer is served; the rest counted. */
const SHOWN = 6;

/**
 * The queue in short, beside the order being checked: ticket, name, wait (RG-FIL-01), and the
 * request awaiting the owner (H52).
 */
export function QueueSummary({
  waiting,
  now,
  title = text.queueTitle,
}: {
  waiting: QueueItem[];
  now: number;
  /** The register's queue unless named (the delivery's at the counters). */
  title?: string;
}) {
  const shown = waiting.slice(0, SHOWN);
  return (
    <section aria-labelledby="queue-short" className={`${sheetClass} flex flex-col gap-2 p-4`}>
      <h2 id="queue-short" className="flex items-baseline gap-2">
        <span className="type-title">{title}</span>
        <span className="text-ink-2">{text.waitingCount(waiting.length)}</span>
      </h2>
      <ol className="flex flex-col gap-1">
        {shown.map((item) => (
          <li key={item.orderId} className="flex items-baseline gap-2">
            <span className="w-14 font-bold figures">{ticketLabel(item.ticket)}</span>
            <span className="min-w-0 flex-1 truncate">{item.customer.name}</span>
            {item.discountPending && <RequestTag className="shrink-0" />}
            <span className="text-14 text-ink-2 figures">{waitOf(item, now)}</span>
          </li>
        ))}
      </ol>
      {waiting.length > SHOWN && (
        <p className="text-14 text-ink-2">{text.moreWaiting(waiting.length - SHOWN)}</p>
      )}
    </section>
  );
}
