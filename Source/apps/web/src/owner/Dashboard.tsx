import {
  formatDate,
  type Dashboard as DashboardData,
  type DashboardQuery,
  type StockAlert,
} from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { dashboardApi } from '../api/dashboard.js';
import { errorMessage } from '../api/error-message.js';
import { stockApi } from '../api/stock.js';
import { labels } from '../labels.js';
import { DayIndicators } from '../manager/DayIndicators.js';
import { buttonClass } from '../ui/button.js';
import { PRESETS, periodOf, shopToday, type Preset } from './dashboard-period.js';
import { Breakdowns, FiguresTable } from './DashboardTables.js';

const text = labels.dashboard;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const day = (date: string) => formatDate(`${date}T12:00:00Z`);

/**
 * The dashboard (T-070, RG-DSH-01 à 04): the period's takings, sales, discounts and credit notes
 * against the period before and a week earlier, then their breakdowns. The owner also sees the
 * live queues and the products under their threshold (RG-DSH-02/03), which the manager already
 * has in the supervision and the stock (RG-DSH-06).
 */
export function Dashboard({ live }: { live: boolean }) {
  const [preset, setPreset] = useState<Preset>('today');
  const [period, setPeriod] = useState<DashboardQuery>(() => periodOf('today', shopToday()));
  const [free, setFree] = useState<DashboardQuery>(period);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Only the latest request answers: a slow earlier period never replaces the one chosen.
  const latest = useRef(0);
  const load = useCallback(
    (query: DashboardQuery) => {
      const request = ++latest.current;
      Promise.all([dashboardApi.read(query), live ? stockApi.alerts() : null]).then(
        ([next, low]) => {
          if (request !== latest.current) return;
          setDashboard(next);
          setAlerts(low);
          setFailure(null);
        },
        (error: unknown) => request === latest.current && setFailure(errorMessage(error)),
      );
    },
    [live],
  );
  useEffect(() => {
    load(period);
    return () => {
      latest.current += 1;
    };
  }, [load, period]);

  const choose = (next: Preset) => {
    setPreset(next);
    if (next !== 'free') setPeriod(periodOf(next, shopToday()));
  };
  const showFree = (event: FormEvent) => {
    event.preventDefault();
    if (free.from && free.to && free.from <= free.to) setPeriod({ ...free });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="type-title">{text.title}</h2>
        <button
          type="button"
          onClick={() => load(period)}
          className={buttonClass('secondary', 'md')}
        >
          {text.refresh}
        </button>
      </header>
      {live && <DayIndicators />}
      <div role="group" aria-label={text.period} className="flex flex-wrap gap-2">
        {PRESETS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={preset === key}
            onClick={() => choose(key)}
            className={buttonClass(preset === key ? 'primary' : 'secondary', 'md')}
          >
            {text.presets[key]}
          </button>
        ))}
      </div>
      {preset === 'free' && (
        <form onSubmit={showFree} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 font-semibold">
            {text.from}
            <input
              type="date"
              value={free.from}
              max={shopToday()}
              onChange={(event) => setFree({ ...free, from: event.target.value })}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            {text.to}
            <input
              type="date"
              value={free.to}
              min={free.from}
              max={shopToday()}
              onChange={(event) => setFree({ ...free, to: event.target.value })}
              className={FIELD}
            />
          </label>
          <button type="submit" className={buttonClass('primary', 'md')}>
            {text.show}
          </button>
        </form>
      )}
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      {dashboard && (
        <>
          <p className="text-18 font-semibold">
            {text.periodOf(day(dashboard.from), day(dashboard.to))}
          </p>
          <FiguresTable dashboard={dashboard} />
          <Breakdowns dashboard={dashboard} alerts={alerts} />
        </>
      )}
    </div>
  );
}
