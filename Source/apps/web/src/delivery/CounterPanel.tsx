import { formatPhone, ticketLabel, type QueueItem } from '@vente-web/shared';

import { labels } from '../labels.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';

const text = labels.delivery;

interface CounterPanelProps {
  /** The order at this counter, if any. */
  mine: QueueItem | null;
  next: QueueItem | null;
  /** Orders held at the other counters (RG-USR-08). */
  elsewhere: QueueItem[];
  busy: boolean;
  onTakeNext: () => void;
  onNoShow: (item: QueueItem) => void;
}

/**
 * The counter's own order (RG-LIV-02, H34). Ready, its ticket and the customer's name show
 * big, to be read out without a public display (RG-DSP-05, RG-TKT-03); absent, it goes back to
 * the queue. Otherwise, one button takes the next paid order, which it names.
 */
export function CounterPanel({
  mine,
  next,
  elsewhere,
  busy,
  onTakeNext,
  onNoShow,
}: CounterPanelProps) {
  return (
    <section
      aria-labelledby="counter-serving"
      className={`${sheetClass} flex min-w-0 flex-col gap-4 p-4`}
    >
      <h2 id="counter-serving" className="type-title">
        {text.counterTitle}
      </h2>
      {mine?.status === 'READY' ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-18 text-ink-2">{text.announce}</p>
          <p className="font-display text-96 font-bold figures">{ticketLabel(mine.ticket)}</p>
          <p className="text-36 font-bold">{mine.customer.name}</p>
          <p className="text-ink-2 figures">{formatPhone(mine.customer.phone)}</p>
          <button
            type="button"
            onClick={() => onNoShow(mine)}
            disabled={busy}
            className={buttonClass('secondary', 'lg', 'mt-3 w-full')}
          >
            {text.noShow}
          </button>
        </div>
      ) : mine ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-18 text-ink-2">{text.preparing}</p>
          <p className="font-display text-36 font-bold figures">{ticketLabel(mine.ticket)}</p>
          <p className="text-21 font-bold">{mine.customer.name}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onTakeNext}
            disabled={busy || !next}
            className={buttonClass('primary', 'lg', 'min-h-20 w-full text-21')}
          >
            <Icon name="user" />
            {busy ? text.taking : text.takeNext}
          </button>
          <p className="text-center text-ink-2">
            {next ? text.next(ticketLabel(next.ticket), next.customer.name) : text.none}
          </p>
        </div>
      )}
      {elsewhere.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-rule pt-3">
          <h3 className="font-semibold text-ink-2">{text.elsewhere}</h3>
          <ul className="flex flex-col gap-1">
            {elsewhere.map((item) => (
              <li key={item.orderId} className="flex items-baseline gap-2">
                <span className="w-14 font-bold figures">{ticketLabel(item.ticket)}</span>
                <span className="min-w-0 flex-1 truncate">{item.customer.name}</span>
                <span className="text-14 text-ink-2">
                  {text.heldBy(item.servedBy?.fullName ?? '', item.station?.name ?? null)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
