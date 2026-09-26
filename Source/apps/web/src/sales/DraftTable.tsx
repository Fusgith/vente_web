import {
  computeQuote,
  formatMga,
  formatQty,
  type DiscountEntry,
  type QuoteTotals,
} from '@vente-web/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { labels } from '../labels.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { quoteInput } from './discount-entry.js';
import type { DraftState } from './draft.js';
import { OrderDiscountSheet } from './OrderDiscountSheet.js';

interface DraftTableProps {
  draft: DraftState;
  onSelect: (key: string) => void;
  onOrderDiscount: (discount: DiscountEntry | null) => void;
  /** The customer's picker, at the end of the header. */
  customer?: ReactNode;
}

const text = labels.sales.draft;

const CELL = 'px-2 first:pl-4 last:pr-4';
const HEAD =
  CELL + ' sticky top-0 z-10 h-10 border-b border-rule bg-white text-14 font-semibold text-ink-2';
const HEAD_PX = 40;

const isZero = (amount: string) => amount === '0.00';

/**
 * The quote as a table (RG-DEV-05): the 7 columns of the PDF, sized to fit the tablet held
 * either way; the totals sit under the table, outside its scroll, so they never hide a line.
 */
export function DraftTable({ draft, onSelect, onOrderDiscount, customer }: DraftTableProps) {
  const { lines, selected } = draft;
  const quote = computeQuote(quoteInput(draft));

  const selectedRow = useRef<HTMLTableRowElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // The line being edited stays in view, below the sticky head.
  useEffect(() => {
    const box = scroller.current;
    const row = selectedRow.current;
    if (!box || !row) return;
    const boxRect = box.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const hiddenAbove = rowRect.top - (boxRect.top + HEAD_PX);
    const hiddenBelow = rowRect.bottom - boxRect.bottom;
    if (hiddenAbove < 0) box.scrollTop += hiddenAbove;
    else if (hiddenBelow > 0) box.scrollTop += hiddenBelow;
  }, [selected]);

  return (
    <section
      aria-labelledby="draft-title"
      className={sheetClass + ' flex min-h-72 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0'}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3 pb-2">
        <h2 id="draft-title" className="type-title">
          {text.title}
        </h2>
        <span className="rounded-full border border-dashed border-rule-strong px-2.5 text-14 leading-6 text-ink-2">
          {text.unsaved}
        </span>
        {customer && <div className="ml-auto max-w-full min-w-0">{customer}</div>}
      </header>
      {lines.length === 0 ? (
        <p className="m-auto max-w-sm p-6 text-center text-ink-2">{text.empty}</p>
      ) : (
        <>
          <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-left text-16">
              <thead>
                <tr>
                  <th className={HEAD + ' w-11'}>{text.number}</th>
                  <th className={HEAD}>{text.designation}</th>
                  <th className={HEAD + ' w-22 text-right'}>{text.quantity}</th>
                  <th className={HEAD + ' w-24'}>{text.unit}</th>
                  <th className={HEAD + ' w-34 text-right'}>{text.unitPrice}</th>
                  <th className={HEAD + ' w-32 text-right'}>{text.discount}</th>
                  <th className={HEAD + ' w-38 text-right'}>{text.netAmount}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const current = line.key === selected;
                  const factor = formatQty(line.unit.factor);
                  const totals = quote.lines[index]!;
                  const row = `${CELL} h-14 border-b border-rule py-1 ${current ? 'bg-saffron-soft' : ''}`;
                  return (
                    <tr
                      key={line.key}
                      ref={current ? selectedRow : undefined}
                      aria-current={current ? 'true' : undefined}
                    >
                      <td
                        className={`${row} figures ${
                          current
                            ? 'shadow-[inset_2px_0_0_var(--color-ink),inset_6px_0_0_var(--color-saffron)]'
                            : ''
                        }`}
                      >
                        {index + 1}
                      </td>
                      <td className={row}>
                        <span className={tagClass}>{line.product.sku}</span>
                        <span className="line-clamp-2 leading-5" title={line.product.name}>
                          {line.product.name}
                        </span>
                      </td>
                      <td className={row + ' text-right'}>
                        <button
                          type="button"
                          onClick={() => onSelect(line.key)}
                          aria-label={text.editQty(index + 1, formatQty(line.qty))}
                          className={`min-h-12 min-w-14 rounded-control border px-2.5 text-right text-18 font-semibold figures transition-colors duration-100 ${
                            current
                              ? 'border-indigo bg-indigo-soft'
                              : 'border-rule-strong bg-white active:bg-indigo-soft'
                          }`}
                        >
                          {formatQty(line.qty)}
                        </button>
                      </td>
                      <td className={row + ' leading-5'}>
                        <span className="line-clamp-2">{line.unit.label}</span>{' '}
                        {factor !== '1' && (
                          <span className="block text-14 text-ink-2">
                            {labels.sales.factorOf(factor, line.product.baseUnit)}
                          </span>
                        )}
                      </td>
                      <td className={row + ' text-right figures'}>{formatMga(line.unit.price)}</td>
                      <td
                        className={`${row} text-right leading-5 figures ${totals.withinLimit ? '' : 'text-madder'}`}
                      >
                        {!isZero(totals.discount) && (
                          <>
                            <span className="block font-semibold">
                              {text.minus(formatMga(totals.discount))}
                            </span>
                            <span className="block text-14 text-ink-2">
                              {text.pct(formatQty(totals.discountPct))}
                            </span>
                          </>
                        )}
                      </td>
                      <td className={row + ' text-right font-semibold figures'}>
                        {formatMga(totals.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Totals quote={quote} draft={draft} onOrderDiscount={onOrderDiscount} />
        </>
      )}
    </section>
  );
}

interface TotalsProps {
  quote: QuoteTotals;
  draft: DraftState;
  onOrderDiscount: (discount: DiscountEntry | null) => void;
}

/**
 * Under the table, in the order of RG-DEV-05: gross total, line discounts, subtotal, order
 * discount (with its rate when typed as one), amount due, then the reminder of all discounts.
 * Without any discount, the amount due alone. The order discount is typed from here.
 */
function Totals({ quote, draft, onOrderDiscount }: TotalsProps) {
  const [open, setOpen] = useState(false);
  const rows: { label: string; amount: string; wrong?: boolean }[] = [];
  if (!isZero(quote.discountTotal)) {
    rows.push({ label: text.grossTotal, amount: formatMga(quote.grossTotal) });
    if (!isZero(quote.lineDiscounts)) {
      rows.push({ label: text.lineDiscounts, amount: text.minus(formatMga(quote.lineDiscounts)) });
    }
    if (!isZero(quote.orderDiscount)) {
      rows.push({ label: text.subtotal, amount: formatMga(quote.subtotal) });
      rows.push({
        label: quote.orderDiscountPct
          ? text.orderDiscountPct(formatQty(quote.orderDiscountPct))
          : text.orderDiscount,
        amount: text.minus(formatMga(quote.orderDiscount)),
        wrong: !quote.orderWithinLimit,
      });
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-6 gap-y-2 border-t-2 border-ink px-4 py-2">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={buttonClass('secondary', 'md', 'shrink-0')}
      >
        <Icon name="percent" className="size-5" />
        {labels.sales.discount.order}
      </button>
      <dl className="ml-auto grid grid-cols-[1fr_auto] items-baseline gap-x-6 text-right">
        {rows.map((row) => (
          <div key={row.label} className={`contents ${row.wrong ? 'text-madder' : 'text-ink-2'}`}>
            <dt>{row.label}</dt>
            <dd className="figures">{row.amount}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="text-18 font-semibold">{text.total}</dt>
          <dd className="text-24 font-bold figures">{formatMga(quote.total)}</dd>
        </div>
        {!isZero(quote.discountTotal) && (
          <div className="contents text-14 text-ink-2">
            <dt>{text.discountTotal}</dt>
            <dd className="figures">{text.minus(formatMga(quote.discountTotal))}</dd>
          </div>
        )}
      </dl>
      {!quote.orderWithinLimit && (
        <p role="alert" className="flex basis-full items-start gap-2 font-semibold text-madder">
          <Icon name="alert" className="size-5 shrink-0 translate-y-px" />
          {labels.sales.discount.orderTooHigh(formatMga(quote.maxOrderDiscount))}
        </p>
      )}
      {open && (
        <OrderDiscountSheet
          draft={draft}
          onApply={onOrderDiscount}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
