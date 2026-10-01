import { formatMga, type SupervisionToday } from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { errorMessage } from '../api/error-message.js';
import { supervisionApi } from '../api/supervision.js';
import { labels } from '../labels.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';
import { sheetClass } from '../ui/button.js';

const text = labels.supervision;
/** The averages move with the clock too: read again every minute. */
const EVERY_MINUTE = 60_000;

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">
      <dt className="text-14 leading-5 font-semibold text-ink-2">{label}</dt>
      <dd className="figures">{children}</dd>
    </div>
  );
}

const minutes = (value: number | null) =>
  value === null ? (
    <span className="text-18 text-ink-2">{text.noWaitYet}</span>
  ) : (
    <span className="text-24 font-bold">{labels.register.minutes(value)}</span>
  );

/**
 * The day at a glance (RG-DSP-04, H38): the average waits at the register and at the
 * counters, the orders under way, those paid and not yet delivered. Read again whenever a queue
 * or an order changes, and every minute.
 */
export function DayIndicators() {
  const [today, setToday] = useState<SupervisionToday | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const latest = useRef(0);
  const load = useCallback(() => {
    const request = ++latest.current;
    supervisionApi.today().then(
      (next) => {
        if (request !== latest.current) return;
        setToday(next);
        setFailure(null);
      },
      (error: unknown) => {
        if (request === latest.current) setFailure(errorMessage(error));
      },
    );
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, EVERY_MINUTE);
    return () => {
      window.clearInterval(timer);
      latest.current += 1;
    };
  }, [load]);
  useRealtimeConnect(load);
  useRealtimeEvent('queue.changed', load);
  useRealtimeEvent('order.status_changed', load);

  return (
    <section aria-labelledby="day-indicators" className="flex flex-col gap-2">
      <h2 id="day-indicators" className="sr-only">
        {text.indicators}
      </h2>
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      {today && (
        <dl
          className={`${sheetClass} grid grid-cols-2 gap-px overflow-hidden bg-rule lg:grid-cols-4`}
        >
          <Figure label={text.registerWait}>{minutes(today.registerWait)}</Figure>
          <Figure label={text.deliveryWait}>{minutes(today.deliveryWait)}</Figure>
          <Figure label={text.inProgress}>
            <span className="text-24 font-bold">{today.inProgress}</span>
          </Figure>
          <Figure label={text.paidUndelivered}>
            <span className="text-24 font-bold">{today.paidUndelivered.count}</span>
            <span className="block text-ink-2">{formatMga(today.paidUndelivered.total)}</span>
          </Figure>
        </dl>
      )}
    </section>
  );
}
