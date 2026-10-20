import { formatAmount, formatDate, formatMga, type ProductUnitDetail } from '@vente-web/shared';

import { labels } from '../labels.js';

const WIDTH = 600;
const HEIGHT = 140;
const LEFT = 96;
const TOP = 12;
const BOTTOM = 24;
/** The current price runs to the right edge: the line never stops at its last change. */
const NOW_SHARE = 0.1;

/**
 * The base price of one unit over time (RG-ART-07, RG-DSH-03): a step line, oldest on the left,
 * the lowest and highest prices on the axis. Shown from two prices; the table has the detail.
 */
export function PriceCurve({ unit }: { unit: ProductUnitDetail }) {
  const prices = unit.prices.filter((entry) => entry.customerType === null).reverse();
  const first = prices[0];
  const last = prices.at(-1);
  if (!first || !last || prices.length < 2) return null;

  const times = prices.map((entry) => Date.parse(entry.effectiveFrom));
  const values = prices.map((entry) => Number(entry.price));
  const start = times[0] ?? 0;
  const span = Math.max((times.at(-1) ?? start) - start, 1);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const plotWidth = WIDTH - LEFT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (time: number) => LEFT + ((time - start) / span) * plotWidth * (1 - NOW_SHARE);
  const y = (value: number) =>
    high === low ? TOP + plotHeight / 2 : TOP + ((high - value) / (high - low)) * plotHeight;

  const steps = values.flatMap((value, index) => {
    const next = times[index + 1];
    const end = next === undefined ? WIDTH : x(next);
    return [`${x(times[index] ?? start)},${y(value)}`, `${end},${y(value)}`];
  });

  return (
    <svg
      role="img"
      aria-label={labels.products.curve(unit.label, formatMga(first.price), formatMga(last.price))}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-2xl text-ink"
    >
      <line x1={LEFT} y1={TOP} x2={LEFT} y2={HEIGHT - BOTTOM} className="stroke-rule-strong" />
      <line
        x1={LEFT}
        y1={HEIGHT - BOTTOM}
        x2={WIDTH}
        y2={HEIGHT - BOTTOM}
        className="stroke-rule-strong"
      />
      <g className="fill-ink-2 text-14 figures" textAnchor="end">
        <text x={LEFT - 8} y={y(high) + 5}>
          {formatAmount(String(high))}
        </text>
        {high !== low && (
          <text x={LEFT - 8} y={y(low) + 5}>
            {formatAmount(String(low))}
          </text>
        )}
      </g>
      <g className="fill-ink-2 text-14 figures">
        <text x={LEFT} y={HEIGHT - 4}>
          {formatDate(first.effectiveFrom)}
        </text>
        <text x={x(times.at(-1) ?? start)} y={HEIGHT - 4} textAnchor="middle">
          {formatDate(last.effectiveFrom)}
        </text>
      </g>
      <polyline
        points={steps.join(' ')}
        fill="none"
        strokeWidth={3}
        strokeLinejoin="round"
        className="stroke-indigo"
      />
    </svg>
  );
}
