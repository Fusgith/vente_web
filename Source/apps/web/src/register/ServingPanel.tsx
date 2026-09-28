import {
  formatPhone,
  formatTime,
  ticketLabel,
  type QueueItem,
  type RegisterSession,
} from '@vente-web/shared';

import { labels } from '../labels.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';

const text = labels.register;

interface ServingPanelProps {
  /** The order at this register, if any. */
  mine: QueueItem | null;
  /** The first waiting, called by « Appeler le suivant ». */
  next: QueueItem | null;
  /** Orders at the other registers. */
  elsewhere: QueueItem[];
  /** The register opened, named under the title (⚠️ H32). */
  register: RegisterSession | null;
  busy: boolean;
  onCallNext: () => void;
  onNoShow: (item: QueueItem) => void;
}

/**
 * The register's own customer. Called, its ticket and name show big, to be read out when there
 * is no public display (RG-DSP-05, RG-TKT-03); absent, it goes back to the queue (RG-FIL-04).
 * Otherwise, one button calls the next ticket, which it names (RG-FIL-03).
 */
export function ServingPanel({
  mine,
  next,
  elsewhere,
  register,
  busy,
  onCallNext,
  onNoShow,
}: ServingPanelProps) {
  return (
    <section
      aria-labelledby="register-serving"
      className={`${sheetClass} flex min-w-0 flex-col gap-4 p-4`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="register-serving" className="type-title">
          {text.servingTitle}
        </h2>
        {register && (
          <span className="text-14 text-ink-2">
            {text.sessionOf(register.station.name, formatTime(register.openedAt))}
          </span>
        )}
      </header>
      {mine ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-18 text-ink-2">{text.announce}</p>
          <p className="font-display text-96 font-bold figures" data-ticket>
            {ticketLabel(mine.ticket)}
          </p>
          <p className="text-36 font-bold">{mine.customer.name}</p>
          <p className="text-ink-2 figures">{formatPhone(mine.customer.phone)}</p>
          <p className="mt-2 text-ink-2">{text.orderOf(mine.number, mine.salesUser.fullName)}</p>
          <button
            type="button"
            onClick={() => onNoShow(mine)}
            disabled={busy}
            className={buttonClass('secondary', 'lg', 'mt-3 w-full')}
          >
            {text.noShow}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onCallNext}
            disabled={busy || !next}
            className={buttonClass('primary', 'lg', 'min-h-20 w-full text-21')}
          >
            <Icon name="user" />
            {busy ? text.calling : text.callNext}
          </button>
          <p className="text-center text-ink-2">
            {next ? text.next(ticketLabel(next.ticket), next.customer.name) : text.waitingCount(0)}
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
                  {text.servedBy(item.servedBy?.fullName ?? '', item.station?.name ?? null)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
