import {
  discountAmount,
  formatAmount,
  formatQty,
  ticketLabel,
  type DiscountEntry,
  type Order,
  type OrderDiscounts,
  type PaymentInput,
  type QuoteLine,
} from '@vente-web/shared';
import { useId, useState } from 'react';

import { requestPending } from '../api/discount-requests.js';
import { labels } from '../labels.js';
import type { RequestInput } from '../sales/useQuoteActions.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { CELL, HEAD, isZero } from '../ui/document-table.js';
import { AmountHead, TotalsList } from '../ui/DocumentTable.js';
import { Icon } from '../ui/Icon.js';
import { CancelOrderSheet } from './CancelOrderSheet.js';
import { LineAdjustSheet } from './LineAdjustSheet.js';
import { PaymentSheet } from './PaymentSheet.js';
import { RegisterDiscountSheet } from './RegisterDiscountSheet.js';
import { RegisterOwnerControls } from './RegisterOwnerControls.js';
import { useSuggestedDiscounts } from './useSuggestedDiscounts.js';

const text = labels.register;
const draft = labels.sales.draft;

/**
 * The lines whose suggested discount goes beyond their discount (H62), as the API takes them; a
 * line the owner's grant covers keeps it (RG-REM-04).
 */
function belowSuggested(
  order: Order,
  suggested: readonly (string | null)[],
): OrderDiscounts['lines'] {
  return order.lines.flatMap((line, index) => {
    const pct = suggested[index];
    if (!pct || line.discountSource === 'CODE') return [];
    const discount = { kind: 'pct', value: pct } as const;
    // Amounts of 2 decimals: exact as numbers at a shop's scale, and the API checks anyway.
    return Number(discountAmount(discount, line.gross)) > Number(line.discountAmount)
      ? [{ position: line.position, discount }]
      : [];
  });
}

/** Where a line's discount comes from, as the cashier checks it (§5.6, H63, H64). */
function origin(line: QuoteLine, granted: boolean): string | null {
  if (line.discountSource === 'WITHIN_CAP') return text.withinCap;
  if (line.discountSource === 'RULE') return text.byRule;
  if (line.discountSource === 'CODE') return granted ? text.byOwner : text.byCode;
  return null;
}

interface OrderControlProps {
  order: Order;
  busy: boolean;
  onLower: (line: QuoteLine, qty: string) => Promise<boolean>;
  onRemove: (line: QuoteLine) => Promise<boolean>;
  /** A discount within the caps on a line by its position, or on the total for null (H61). */
  onDiscount: (position: number | null, discount: DiscountEntry | null) => Promise<boolean>;
  /** The suggested discounts of the owner's rules, on the lines below them, in one go (H62). */
  onApplySuggested: (lines: OrderDiscounts['lines']) => Promise<boolean>;
  onCancel: (reason: string) => Promise<boolean>;
  /** An article to add or a discount to change: the salesperson's, in one click (RG-CMD-05b). */
  onSendBack: () => void;
  onPay: (input: PaymentInput, key: string) => Promise<boolean>;
  /** The owner's code typed in its sheet: null once attached, else why it was refused. */
  onAttachCode: (code: string) => Promise<string | null>;
  /** The request to the owner from its sheet: null once sent, else why it was refused. */
  onAsk: (request: RequestInput) => Promise<string | null>;
  onWithdraw: () => void;
  onSetAside: () => void;
}

/**
 * The order at the register, checked with the customer before payment (§5.6): its lines as a
 * table (RG-DEV-05) with where each discount comes from, a quantity lowered or a line removed
 * (RG-CMD-05b), a discount applied within the caps on a line or the total (H61) — the owner's
 * rules suggesting theirs, applied in one go (H62) —, the order sent back to its salesperson for
 * an article to add or a discount to change
 * (H56), or the whole order cancelled with a reason (RG-ANN-01). The owner's code, typed
 * here before payment, grants its discounts beyond the caps (RG-CMD-05b, H42); else a discount is
 * asked of the owner (H51). While the request waits, the payment waits too (RG-REM-05).
 */
export function OrderControl({
  order,
  busy,
  onLower,
  onRemove,
  onDiscount,
  onApplySuggested,
  onCancel,
  onSendBack,
  onPay,
  onAttachCode,
  onAsk,
  onWithdraw,
  onSetAside,
}: OrderControlProps) {
  // The line open by its sale unit, one per order: a line removed elsewhere renumbers the others,
  // never the article the sheet was opened on; gone itself, the sheet closes.
  const [editing, setEditing] = useState<string | null>(null);
  // The discount open: a line by its position, the total for null, none for undefined.
  const [discounting, setDiscounting] = useState<number | null | undefined>(undefined);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const waitsId = useId();
  const waiting = requestPending(order.discountRequest);
  const suggested = useSuggestedDiscounts(order);
  const toApply = belowSuggested(order, suggested);
  const below = new Set(toApply.map((item) => item.position));
  // A line removed meanwhile closes its discount sheet.
  const opened =
    discounting === null || order.lines.some((item) => item.position === discounting)
      ? discounting
      : undefined;
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
            {order.lines.map((item, index) => {
              const ruled = below.has(item.position) ? (suggested[index] ?? null) : null;
              const row = `${CELL} h-14 border-b border-rule py-1`;
              const factor = formatQty(item.factor);
              const source = origin(item, order.discountCode?.granted === true);
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
                  <td className={`${row} text-right`}>
                    <button
                      type="button"
                      aria-label={text.lineDiscount(item.position)}
                      aria-haspopup="dialog"
                      onClick={() => setDiscounting(item.position)}
                      disabled={busy || waiting}
                      className="min-h-12 w-full rounded-control border border-rule-strong bg-white px-2 text-right leading-5 figures transition-colors duration-100 active:bg-indigo-soft disabled:border-dashed"
                    >
                      {isZero(item.discountAmount) ? (
                        <span className="block text-ink-2">{text.noDiscount}</span>
                      ) : (
                        <>
                          <span className="block font-semibold">
                            {draft.minus(formatAmount(item.discountAmount))}
                          </span>
                          {/* Its origin wraps under the rate: the column is narrow (H63, H64). */}
                          <span className="block text-14 whitespace-normal text-ink-2">
                            {draft.pct(formatQty(item.discountPct))}
                            {source && ` · ${source}`}
                          </span>
                        </>
                      )}
                      {ruled && (
                        <span className="block text-14 font-semibold text-indigo">
                          {text.suggestedPct(formatQty(ruled))}
                        </span>
                      )}
                    </button>
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
          <RegisterOwnerControls
            order={order}
            busy={busy}
            waitsId={waitsId}
            onAttachCode={onAttachCode}
            onAsk={onAsk}
            onWithdraw={onWithdraw}
            onSetAside={onSetAside}
          />
          {toApply.length > 0 && (
            <button
              type="button"
              onClick={() => void onApplySuggested(toApply)}
              disabled={busy || waiting}
              className={buttonClass('primary', 'md', 'shrink-0')}
            >
              {text.applySuggested}
            </button>
          )}
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setDiscounting(null)}
            disabled={busy || waiting}
            className={buttonClass('secondary', 'md', 'shrink-0')}
          >
            {text.totalDiscount}
          </button>
          <button
            type="button"
            onClick={onSendBack}
            disabled={busy}
            className={buttonClass('secondary', 'md', 'shrink-0')}
          >
            {text.sendBack}
          </button>
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
            disabled={busy || waiting}
            aria-describedby={waiting ? waitsId : undefined}
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
      {opened !== undefined && (
        <RegisterDiscountSheet
          key={opened ?? 'total'}
          order={order}
          position={opened}
          suggested={suggested}
          busy={busy}
          onApply={(discount) =>
            void onDiscount(opened, discount).then((ok) => {
              if (ok) setDiscounting(undefined);
            })
          }
          onClose={() => setDiscounting(undefined)}
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
