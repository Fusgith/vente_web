import {
  formatAmount,
  formatDate,
  formatTime,
  formatQty,
  type Dashboard,
  type DashboardFigures,
  type StockAlert,
} from '@vente-web/shared';

import { labels } from '../labels.js';
import { sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { share, variation } from './dashboard-period.js';

const text = labels.dashboard;
const ROW = `${CELL} border-b border-rule py-2 align-top`;
const SECTION = `${sheetClass} flex w-full flex-col gap-2 overflow-hidden pb-3`;

export interface Column {
  label: string;
  numeric?: boolean;
}

/** A titled table of the dashboard: strings only, the figures aligned right. */
export function Breakdown({
  id,
  title,
  columns,
  rows,
  empty = text.nothing,
}: {
  id: string;
  title: string;
  columns: readonly Column[];
  rows: readonly (readonly string[])[];
  empty?: string;
}) {
  return (
    <section aria-labelledby={id} className={SECTION}>
      <h2 id={id} className="px-4 pt-3 text-18 font-semibold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="px-4 text-ink-2">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.label}
                    className={`${HEAD} ${column.numeric ? 'text-right' : ''}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, at) => (
                    <td
                      key={at}
                      className={`${ROW} ${columns[at]?.numeric ? 'text-right figures' : ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type FigureKey = keyof DashboardFigures;
const COUNTS: readonly FigureKey[] = ['invoices', 'creditNotes'];
const ORDER: readonly FigureKey[] = [
  'collected',
  'invoices',
  'averageBasket',
  'sales',
  'gross',
  'discounts',
  'discountsWithinCap',
  'discountsByRule',
  'discountsByCode',
  'creditNotes',
  'refunded',
];

function shown(key: FigureKey, figures: DashboardFigures): string {
  const value = figures[key];
  return COUNTS.includes(key) ? String(value) : formatAmount(value);
}

/** The value of an earlier period, with how much the current one moved from it. */
function Compared({
  figure,
  now,
  then,
}: {
  figure: FigureKey;
  now: DashboardFigures;
  then: DashboardFigures;
}) {
  const moved = variation(now[figure], then[figure]);
  return (
    <td className={`${ROW} text-right figures`}>
      {shown(figure, then)}
      <span className="block text-14 text-ink-2">{moved ?? text.noBase}</span>
    </td>
  );
}

/** The period's figures beside the period before and the same days a week earlier (RG-DSH-04). */
export function FiguresTable({ dashboard }: { dashboard: Dashboard }) {
  const { current, previous, weekBefore } = dashboard;
  const discounted = share(current.discounts, current.gross);
  return (
    <section aria-labelledby="dashboard-figures" className={SECTION}>
      <h2 id="dashboard-figures" className="sr-only">
        {text.figure}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className={HEAD}>{text.figure}</th>
              <th className={`${HEAD} text-right`}>{text.current}</th>
              <th className={`${HEAD} text-right`}>{text.previous}</th>
              <th className={`${HEAD} text-right`}>{text.weekBefore}</th>
            </tr>
          </thead>
          <tbody>
            {ORDER.map((figure) => (
              <tr key={figure}>
                <th
                  scope="row"
                  className={`${ROW} font-normal ${figure.startsWith('discountsBy') || figure === 'discountsWithinCap' ? 'pl-8' : 'font-semibold'}`}
                >
                  {text.figures[figure]}
                </th>
                <td className={`${ROW} text-right font-semibold figures`}>
                  {shown(figure, current)}
                  {figure === 'discounts' && discounted && (
                    <span className="block text-14 font-normal text-ink-2">
                      {text.ofGross(discounted)}
                    </span>
                  )}
                </td>
                <Compared figure={figure} now={current} then={previous} />
                <Compared figure={figure} now={current} then={weekBefore} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const day = (date: string) => formatDate(`${date}T12:00:00Z`);

/** Every breakdown of the period (RG-DSH-01, 03), then the products under their threshold. */
export function Breakdowns({
  dashboard,
  alerts,
}: {
  dashboard: Dashboard;
  alerts: StockAlert[] | null;
}) {
  const sales = { label: text.sales, numeric: true };
  const invoices = { label: text.invoices, numeric: true };
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          id="dashboard-methods"
          title={text.byMethod}
          columns={[{ label: text.method }, { label: text.amount, numeric: true }]}
          rows={dashboard.byMethod.map((row) => [row.label, formatAmount(row.amount)])}
        />
        <Breakdown
          id="dashboard-salespeople"
          title={text.bySalesperson}
          columns={[{ label: text.salesperson }, invoices, sales]}
          rows={dashboard.bySalesperson.map((row) => [
            row.name,
            String(row.invoices),
            formatAmount(row.sales),
          ])}
        />
        <Breakdown
          id="dashboard-hours"
          title={text.byHour}
          columns={[{ label: text.hour }, invoices, sales]}
          rows={dashboard.byHour.map((row) => [
            text.hourOf(row.hour),
            String(row.invoices),
            formatAmount(row.sales),
          ])}
        />
        <Breakdown
          id="dashboard-categories"
          title={text.byCategory}
          columns={[{ label: text.category }, sales]}
          rows={dashboard.byCategory.map((row) => [
            row.name || text.noCategory,
            formatAmount(row.sales),
          ])}
        />
      </div>
      {dashboard.from !== dashboard.to && (
        <Breakdown
          id="dashboard-days"
          title={text.byDay}
          columns={[{ label: text.day }, invoices, sales]}
          rows={dashboard.byDay.map((row) => [
            day(row.date),
            String(row.invoices),
            formatAmount(row.sales),
          ])}
        />
      )}
      <Breakdown
        id="dashboard-top"
        title={text.top}
        columns={[
          { label: text.sku },
          { label: text.product },
          { label: text.sold, numeric: true },
          { label: text.byUnit },
          sales,
          { label: text.available, numeric: true },
        ]}
        rows={dashboard.topProducts.map((row) => [
          row.sku,
          row.name,
          text.qtyOf(formatQty(row.baseQty), row.baseUnit),
          row.units.map((unit) => text.qtyOf(formatQty(unit.qty), unit.unit)).join(', '),
          formatAmount(row.sales),
          text.qtyOf(formatQty(row.available), row.baseUnit),
        ])}
      />
      {alerts && (
        <Breakdown
          id="dashboard-alerts"
          title={text.alerts}
          empty={text.noAlert}
          columns={[
            { label: text.sku },
            { label: text.product },
            { label: text.available, numeric: true },
            { label: text.threshold, numeric: true },
          ]}
          rows={alerts.map((row) => [
            row.sku,
            row.name,
            text.qtyOf(formatQty(row.available), row.baseUnit),
            text.qtyOf(formatQty(row.alertThreshold), row.baseUnit),
          ])}
        />
      )}
      <Breakdown
        id="dashboard-prices"
        title={text.priceChanges}
        empty={text.noPriceChange}
        columns={[
          { label: text.date },
          { label: text.product },
          { label: text.unit },
          { label: text.before, numeric: true },
          { label: text.after, numeric: true },
          { label: text.change, numeric: true },
          { label: text.source },
          { label: text.by },
        ]}
        rows={dashboard.priceChanges.map((row) => [
          `${formatDate(row.at)} ${formatTime(row.at)}`,
          `${row.sku} ${row.name}`,
          row.unit,
          formatAmount(row.before),
          formatAmount(row.after),
          variation(row.after, row.before) ?? text.noBase,
          text.sources[row.source],
          row.by,
        ])}
      />
    </>
  );
}
