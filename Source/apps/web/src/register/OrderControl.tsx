import {
  formatAmount,
  formatQty,
  ticketLabel,
  type Order,
  type PaymentInput,
  type QuoteLine,
} from '@vente-web/shared';
import { useEffect, useRef, useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { CELL, HEAD, isZero } from '../ui/document-table.js';
import { AmountHead, TotalsList } from '../ui/DocumentTable.js';
import { Icon } from '../ui/Icon.js';
import { DiscountCodeSheet } from '../sales/DiscountCodeSheet.js';
import { CancelOrderSheet } from './CancelOrderSheet.js';
import { LineAdjustSheet } from './LineAdjustSheet.js';
import { PaymentSheet } from './PaymentSheet.js';

const text = labels.register;
const draft = labels.sales.draft;

/** Where a line's discount comes from, as the cashier checks it (§5.6). */
function origin(line: QuoteLine): string | null {
  if (line.discountSource === 'WITHIN_CAP') return text.withinCap;
  if (line.discountSource === 'CODE') return text.byCode;
  return null;
}

interface OrderControlProps {
  order: Order;
  busy: boolean;
  onLower: (line: QuoteLine, qty: string) => Promise<boolean>;
  onRemove: (line: QuoteLine) => Promise<boolean>;
  onCancel: (reason: string) => Promise<boolean>;
  onPay: (input: PaymentInput, key: string) => Promise<boolean>;
  /** The owner's code typed in its sheet: null once attached, else why it was refused. */
  onAttachCode: (code: string) => Promise<string | null>;
}

/**
 * The order at the register, checked with the customer before payment (§5.6): its lines as a
 * table (RG-DEV-05) with where each discount comes from, a quantity lowered or a line removed
 * (RG-CMD-05b), or the whole order cancelled with a reason (RG-ANN-01). The owner's code, typed
 * here before payment, grants its discounts beyond the caps (RG-CMD-05b, H42); once attached, its
 * tag takes the button's place.
 */
export function OrderControl({
  order,
  busy,
  onLower,
  onRemove,
  onCancel,
  onPay,
  onAttachCode,
}: OrderControlProps) {
  // The line open by its sale unit, one per order: a line removed elsewhere renumbers the others,
  // never the article the sheet was opened on; gone itself, the sheet closes.
  const [editing, setEditing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [coding, setCoding] = useState(false);
  const tag = useRef<HTMLSpanElement>(null);
  const shownCode = useRef(order.discountCode?.code ?? null);
  // The code attached, its button gives way to the tag: the focus, left on nothing as the sheet
  // closes, goes to the tag, so a screen reader says the code is on.
  useEffect(() => {
    const code = order.discountCode?.code ?? null;
    if (coding || code === shownCode.current) return;
    shownCode.current = code;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (code && lost) tag.current?.focus();
  }, [order.discountCode, coding]);
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
        <div className="flex flex-wrap gap-2">
          {order.discountCode ? (
            <span
              ref={tag}
              tabIndex={-1}
              className="inline-flex min-h-12 items-center gap-2 rounded-control border border-indigo bg-indigo-soft px-4 font-semibold text-ink figures"
            >
              <Icon name="key" className="size-5 text-indigo" />
              {labels.sales.code.tag(order.discountCode.code)}
            </span>
          ) : (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setCoding(true)}
              disabled={busy}
              className={buttonClass('secondary', 'md', 'shrink-0')}
            >
              <Icon name="key" className="size-5" />
              {labels.sales.code.open}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCancelling(true)}
            disabled={busy}
            className={buttonClass('destructive', 'md', 'shrink-0')}
          >
            {text.cancelOrder}
          </button>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <TotalsList totals={order} />
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setPaying(true)}
            disabled={busy}
            className={buttonClass('primary', 'lg', 'min-w-56')}
          >
            <Icon name="check" className="size-5" />
            {text.pay}
          </button>
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
      {paying && (
        <PaymentSheet
          order={order}
          ticket={ticket}
          busy={busy}
          onPay={(input, key) =>
            onPay(input, key).then((ok) => {
              if (ok) setPaying(false);
              return ok;
            })
          }
          onClose={() => setPaying(false)}
        />
      )}
      {coding && (
        <DiscountCodeSheet
          hint={text.codeHint}
          onAttach={onAttachCode}
          onClose={() => setCoding(false)}
        />
      )}
      {cancelling && (
        <CancelOrderSheet
          ticket={ticket}
          name={order.customer.name}
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
