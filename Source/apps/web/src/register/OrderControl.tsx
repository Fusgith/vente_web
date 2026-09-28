import {
  formatAmount,
  formatMga,
  formatQty,
  ticketLabel,
  type Order,
  type QuoteLine,
} from '@vente-web/shared';
import { useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { CancelOrderSheet } from './CancelOrderSheet.js';
import { LineAdjustSheet } from './LineAdjustSheet.js';

const text = labels.register;
const draft = labels.sales.draft;

const CELL = 'px-2 first:pl-4 last:pr-4';
const HEAD = `${CELL} sticky top-0 z-10 h-12 border-b border-rule bg-white pb-1 align-bottom text-14 leading-5 font-semibold text-ink-2`;
const isZero = (amount: string) => amount === '0.00';

/** An amount column: the sign once, under its name; its cells show the figures alone (RG-FMT-01). */
function AmountHead({ label, width }: { label: string; width: string }) {
  return (
    <th className={`${HEAD} ${width} text-right`}>
      {label} <span className="block font-normal">{draft.inCurrency}</span>
    </th>
  );
}

/** Where a line's discount comes from, as the cashier checks it (§5.6). */
function origin(line: QuoteLine): string | null {
  if (line.discountSource === 'WITHIN_CAP') return text.withinCap;
  if (line.discountSource === 'CODE') return text.byCode;
  return null;
}

/** Under the table, in the order of RG-DEV-05; the amount due alone when there is no discount. */
function Totals({ order }: { order: Order }) {
  const rows: { label: string; amount: string }[] = [];
  if (!isZero(order.discountTotal)) {
    rows.push({ label: draft.grossTotal, amount: formatMga(order.grossTotal) });
    if (!isZero(order.lineDiscounts)) {
      rows.push({
        label: draft.lineDiscounts,
        amount: draft.minus(formatMga(order.lineDiscounts)),
      });
    }
    if (!isZero(order.orderDiscount)) {
      rows.push({ label: draft.subtotal, amount: formatMga(order.subtotal) });
      rows.push({
        label: order.orderDiscountPct
          ? draft.orderDiscountPct(formatQty(order.orderDiscountPct))
          : draft.orderDiscount,
        amount: draft.minus(formatMga(order.orderDiscount)),
      });
    }
  }
  return (
    <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 text-right">
      {rows.map((row) => (
        <div key={row.label} className="contents text-ink-2">
          <dt>{row.label}</dt>
          <dd className="figures">{row.amount}</dd>
        </div>
      ))}
      <div className="contents">
        <dt className="text-18 font-semibold">{draft.total}</dt>
        <dd className="text-24 font-bold figures">{formatMga(order.total)}</dd>
      </div>
      {!isZero(order.discountTotal) && (
        <div className="contents text-14 text-ink-2">
          <dt>{draft.discountTotal}</dt>
          <dd className="figures">{draft.minus(formatMga(order.discountTotal))}</dd>
        </div>
      )}
    </dl>
  );
}

interface OrderControlProps {
  order: Order;
  busy: boolean;
  onLower: (line: QuoteLine, qty: string) => Promise<boolean>;
  onRemove: (line: QuoteLine) => Promise<boolean>;
  onCancel: (reason: string) => Promise<boolean>;
}

/**
 * The order at the register, checked with the customer before payment (§5.6): its lines as a
 * table (RG-DEV-05) with where each discount comes from, a quantity lowered or a line removed
 * (RG-CMD-05b), or the whole order cancelled with a reason (RG-ANN-01).
 */
export function OrderControl({ order, busy, onLower, onRemove, onCancel }: OrderControlProps) {
  // The line open by its sale unit, one per order: a line removed elsewhere renumbers the others,
  // never the article the sheet was opened on; gone itself, the sheet closes.
  const [editing, setEditing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const line = order.lines.find((candidate) => candidate.productUnitId === editing) ?? null;
  const ticket = order.ticket ? ticketLabel(order.ticket) : order.number;
  const done = (ok: boolean) => {
    if (ok) setEditing(null);
  };

  return (
    <section
      aria-labelledby="register-order"
      className={`${sheetClass} flex min-h-72 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0`}
    >
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <h2 id="register-order" className="type-title">
          {text.orderTitle(order.number)}
        </h2>
        <span className="text-ink-2">
          {order.customer.name} · {order.salesUser.fullName}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className={`${HEAD} w-11`}>{draft.number}</th>
              <th className={HEAD}>{draft.designation}</th>
              <th className={`${HEAD} w-22 text-right`}>{draft.quantity}</th>
              <th className={`${HEAD} w-24`}>{draft.unit}</th>
              <AmountHead label={draft.unitPrice} width="w-28" />
              <AmountHead label={draft.discount} width="w-28" />
              <AmountHead label={draft.netAmount} width="w-32" />
            </tr>
          </thead>
          <tbody>
            {order.lines.map((item) => {
              const row = `${CELL} h-14 border-b border-rule py-1`;
              const factor = formatQty(item.factor);
              const source = origin(item);
              return (
                <tr key={item.productUnitId}>
                  <td className={`${row} figures`}>{item.position}</td>
                  <td className={row}>
                    <span className={tagClass}>{item.sku}</span>
                    <span className="line-clamp-2 leading-5">{item.name}</span>
                  </td>
                  <td className={`${row} text-right`}>
                    {/* The quantity is the way in, as on the tablet: lowered or removed here. */}
                    <button
                      type="button"
                      aria-label={text.modifyLine(item.position)}
                      onClick={() => setEditing(item.productUnitId)}
                      disabled={busy}
                      className="min-h-12 min-w-14 rounded-control border border-rule-strong bg-white px-2.5 text-right text-18 font-semibold figures transition-colors duration-100 active:bg-indigo-soft disabled:border-dashed"
                    >
                      {formatQty(item.qty)}
                    </button>
                  </td>
                  <td className={`${row} leading-5`}>
                    <span className="line-clamp-2">{item.unitLabel}</span>
                    {factor !== '1' && (
                      <span className="block text-14 text-ink-2">
                        {labels.sales.factorOf(factor, item.baseUnit)}
                      </span>
                    )}
                  </td>
                  <td className={`${row} text-right figures`}>{formatAmount(item.unitPrice)}</td>
                  <td className={`${row} text-right leading-5 figures`}>
                    {!isZero(item.discountAmount) && (
                      <>
                        <span className="block font-semibold">
                          {draft.minus(formatAmount(item.discountAmount))}
                        </span>
                        <span className="block text-14 text-ink-2">
                          {draft.pct(formatQty(item.discountPct))}
                          {source && ` · ${source}`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={`${row} text-right font-semibold figures`}>
                    {formatAmount(item.net)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 flex-wrap items-end gap-x-6 gap-y-2 border-t-2 border-ink px-4 py-2">
        <button
          type="button"
          onClick={() => setCancelling(true)}
          disabled={busy}
          className={buttonClass('destructive', 'md', 'shrink-0')}
        >
          {text.cancelOrder}
        </button>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Totals order={order} />
          <p className="flex items-center gap-2 text-14 text-ink-2">
            <Icon name="info" className="size-5 shrink-0" />
            {text.paymentComing}
          </p>
        </div>
      </div>
      {line && (
        <LineAdjustSheet
          key={line.productUnitId}
          line={line}
          lastLine={order.lines.length === 1}
          busy={busy}
          onLower={(qty) => void onLower(line, qty).then(done)}
          onRemove={() => void onRemove(line).then(done)}
          onClose={() => setEditing(null)}
        />
      )}
      {cancelling && (
        <CancelOrderSheet
          ticket={ticket}
          busy={busy}
          onCancel={(reason) =>
            void onCancel(reason).then((ok) => {
              if (ok) setCancelling(false);
            })
          }
          onClose={() => setCancelling(false)}
        />
      )}
    </section>
  );
}
