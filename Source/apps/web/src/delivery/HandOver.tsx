import { formatQty, type Order } from '@vente-web/shared';

import { labels } from '../labels.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';

const text = labels.delivery;

interface HandOverProps {
  order: Order;
  ticket: string;
  /** Ready: the lines are ticked as handed over; preparing, they are read to fetch the goods. */
  ticked: ReadonlySet<number> | null;
  onTick: (position: number) => void;
  busy: boolean;
  onReady: () => void;
  onDeliver: () => void;
  /** A line missing or damaged: reported to the manager (RG-LIV-04). */
  onIssue: () => void;
}

/**
 * The order at the counter (RG-LIV-02/03): what to fetch, in the sale unit and its base unit
 * equivalence (RG-ART-04); once called, each line ticked as the customer receives it, and only
 * all of them make a delivery — a line missing or damaged is reported as an issue (T-061).
 */
export function HandOver({
  order,
  ticket,
  ticked,
  onTick,
  busy,
  onReady,
  onDeliver,
  onIssue,
}: HandOverProps) {
  const left = ticked ? order.lines.filter((line) => !ticked.has(line.position)).length : 0;
  return (
    <section
      aria-labelledby="counter-order"
      className={`${sheetClass} flex min-h-72 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0`}
    >
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <h2 id="counter-order" className="type-title">
          {text.orderTitle(ticket, order.customer.name)}
        </h2>
        <span className="text-ink-2">{ticked ? text.handOver : text.preparing}</span>
      </header>
      <ul className="min-h-0 flex-1 overflow-auto border-t border-rule">
        {order.lines.map((line) => {
          const factor = formatQty(line.factor);
          const done = ticked?.has(line.position) ?? false;
          const body = (
            <>
              <span className="w-20 shrink-0 text-right text-24 font-bold figures">
                {formatQty(line.qty)}
              </span>
              <span className="w-28 shrink-0 leading-5">
                <span className="block font-semibold">{line.unitLabel}</span>
                {factor !== '1' && (
                  <span className="block text-14 text-ink-2">
                    {labels.sales.factorOf(factor, line.baseUnit)}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 leading-5">
                <span className={tagClass}>{line.sku}</span>
                <span className="block">{line.name}</span>
              </span>
            </>
          );
          return (
            <li key={line.productUnitId} className="border-b border-rule">
              {ticked ? (
                <label
                  className={`flex min-h-16 cursor-pointer items-center gap-4 px-4 py-2 ${done ? 'bg-indigo-soft' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => onTick(line.position)}
                    aria-label={text.handed(line.position)}
                    className="size-7 shrink-0 accent-indigo"
                  />
                  {body}
                </label>
              ) : (
                <div className="flex min-h-16 items-center gap-4 px-4 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t-2 border-ink px-4 py-3">
        <button
          type="button"
          onClick={onIssue}
          disabled={busy}
          className={buttonClass('secondary', 'lg', 'mr-auto')}
        >
          <Icon name="alert" className="size-5" />
          {labels.issues.report}
        </button>
        {ticked ? (
          <>
            <p className="text-ink-2" aria-live="polite">
              {left === 0 ? text.allTicked : text.leftToTick(left)}
            </p>
            <button
              type="button"
              onClick={onDeliver}
              disabled={busy || left > 0}
              className={buttonClass('primary', 'lg', 'min-w-56')}
            >
              <Icon name="check" className="size-5" />
              {busy ? text.delivering : text.deliver}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onReady}
            disabled={busy}
            className={buttonClass('primary', 'lg', 'min-w-56')}
          >
            <Icon name="user" className="size-5" />
            {text.ready}
          </button>
        )}
      </div>
    </section>
  );
}
