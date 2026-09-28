import { formatMga, formatQty } from '@vente-web/shared';

import { labels } from '../labels.js';
import { HEAD, isZero } from './document-table.js';

const text = labels.sales.draft;

/** An amount column: the sign once, under its name; its cells show the figures alone (RG-FMT-01). */
export function AmountHead({ label, width }: { label: string; width: string }) {
  return (
    <th className={`${HEAD} ${width} text-right`}>
      {label} <span className="block font-normal">{text.inCurrency}</span>
    </th>
  );
}

/** What the totals under a quote, an order or an invoice read. */
export interface DocumentTotals {
  grossTotal: string;
  lineDiscounts: string;
  subtotal: string;
  orderDiscount: string;
  orderDiscountPct: string | null;
  discountTotal: string;
  total: string;
}

interface TotalsListProps {
  totals: DocumentTotals;
  /** The order discount above what the lines leave room for, shown as wrong (RG-REM-06). */
  orderDiscountWrong?: boolean;
}

/**
 * Under the table, in the order of RG-DEV-05: gross total, line discounts, subtotal, order
 * discount (with its rate when typed as one), amount due, then the reminder of all discounts.
 * Without any discount, the amount due alone.
 */
export function TotalsList({ totals, orderDiscountWrong = false }: TotalsListProps) {
  const rows: { label: string; amount: string; wrong?: boolean }[] = [];
  if (!isZero(totals.discountTotal)) {
    rows.push({ label: text.grossTotal, amount: formatMga(totals.grossTotal) });
    if (!isZero(totals.lineDiscounts)) {
      rows.push({ label: text.lineDiscounts, amount: text.minus(formatMga(totals.lineDiscounts)) });
    }
    if (!isZero(totals.orderDiscount)) {
      rows.push({ label: text.subtotal, amount: formatMga(totals.subtotal) });
      rows.push({
        label: totals.orderDiscountPct
          ? text.orderDiscountPct(formatQty(totals.orderDiscountPct))
          : text.orderDiscount,
        amount: text.minus(formatMga(totals.orderDiscount)),
        wrong: orderDiscountWrong,
      });
    }
  }
  return (
    <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 text-right">
      {rows.map((row) => (
        <div key={row.label} className={`contents ${row.wrong ? 'text-madder' : 'text-ink-2'}`}>
          <dt>{row.label}</dt>
          <dd className="figures">{row.amount}</dd>
        </div>
      ))}
      <div className="contents">
        <dt className="text-18 font-semibold">{text.total}</dt>
        <dd className="text-24 font-bold figures">{formatMga(totals.total)}</dd>
      </div>
      {!isZero(totals.discountTotal) && (
        <div className="contents text-14 text-ink-2">
          <dt>{text.discountTotal}</dt>
          <dd className="figures">{text.minus(formatMga(totals.discountTotal))}</dd>
        </div>
      )}
    </dl>
  );
}
