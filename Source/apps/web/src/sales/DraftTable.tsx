import {
  computeQuote,
  discountAmount,
  formatAmount,
  formatMga,
  formatQty,
  type DiscountEntry,
  type QuoteTotals,
} from '@vente-web/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { quotesApi } from '../api/quotes.js';
import { labels } from '../labels.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { CELL, HEAD, isZero } from '../ui/document-table.js';
import { AmountHead, TotalsList } from '../ui/DocumentTable.js';
import { Icon } from '../ui/Icon.js';
import { quoteInput } from './discount-entry.js';
import { unsavedChanges, type DraftState } from './draft.js';
import { OrderDiscountSheet } from './OrderDiscountSheet.js';
import { OwnerControls } from './OwnerControls.js';
import { useSalesDiscount } from './sales-discount.js';
import type { QuoteBusy, RequestInput } from './useQuoteActions.js';

interface DraftTableProps {
  draft: DraftState;
  onSelect: (key: string) => void;
  onOrderDiscount: (discount: DiscountEntry | null) => void;
  /** The suggested discounts of the lines below them, applied at the customer's request (H62). */
  onApplySuggested: (applied: Suggested[]) => void;
  onSave: () => void;
  onSubmit: () => void;
  /** A request to the owner from its sheet: null once sent, else why it was refused. */
  onAsk: (request: RequestInput) => Promise<string | null>;
  onWithdraw: () => void;
  /** A save, a validation or a request under way: the buttons wait. */
  busy: QuoteBusy;
  /** The customer's picker, at the end of the header. */
  customer?: ReactNode;
  /** The way to the salesperson's quotes and orders (T-035b), after the quote's status. */
  mine?: ReactNode;
}

const text = labels.sales.draft;

interface Suggested {
  key: string;
  discount: DiscountEntry;
}

/**
 * The lines whose suggested discount goes beyond their discount (H62); a line the owner's grant
 * covers keeps it (RG-REM-04).
 */
function belowSuggested(draft: DraftState, quote: QuoteTotals): Suggested[] {
  return draft.lines.flatMap((line, index) => {
    const totals = quote.lines[index];
    const pct = line.suggestedPct;
    if (!pct || !totals || totals.source === 'CODE') return [];
    const discount = { kind: 'pct', value: pct } as const;
    // Amounts of 2 decimals: exact as numbers at a shop's scale, and the API checks anyway.
    return Number(discountAmount(discount, totals.gross)) > Number(totals.discount)
      ? [{ key: line.key, discount }]
      : [];
  });
}

const HEAD_PX = 48;

const STATUS = 'rounded-full border px-2.5 text-14 leading-6';

/** Unsaved, saved under its number, or saved and changed since: dashed until it is on file. */
function QuoteStatus({ draft }: { draft: DraftState }) {
  if (!draft.saved) {
    return (
      <span className={`${STATUS} border-dashed border-rule-strong text-ink-2`}>
        {text.unsaved}
      </span>
    );
  }
  const changed = unsavedChanges(draft);
  return (
    <span
      className={`${STATUS} figures ${
        changed
          ? 'border-dashed border-rule-strong text-ink-2'
          : 'border-indigo bg-indigo-soft font-semibold text-ink'
      }`}
    >
      {text.savedAs(draft.saved.number)}
      {changed && `, ${text.changed}`}
    </span>
  );
}

/**
 * The quote as a table (RG-DEV-05): the 7 columns of the PDF, sized to fit the tablet held
 * either way; the totals sit under the table, outside its scroll, so they never hide a line.
 */
export function DraftTable({
  draft,
  onSelect,
  onOrderDiscount,
  onApplySuggested,
  onSave,
  onSubmit,
  onAsk,
  onWithdraw,
  busy,
  customer,
  mine,
}: DraftTableProps) {
  const { lines, selected } = draft;
  // No discount column when the salesperson gives none (H60).
  const discounts = useSalesDiscount();
  const quote = computeQuote(quoteInput(draft));
  const toApply = belowSuggested(draft, quote);
  const below = new Set(toApply.map((item) => item.key));
  // Lines of the products the last validation found short of stock (RG-CMD-02).
  const short = new Set(draft.shortages?.map((shortage) => shortage.productId));

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
        <QuoteStatus draft={draft} />
        {mine}
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
                  <AmountHead label={text.unitPrice} width="w-28" />
                  {discounts && <AmountHead label={text.discount} width="w-28" />}
                  <AmountHead label={text.netAmount} width="w-34" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const current = line.key === selected;
                  const lacking = short.has(line.product.id);
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
                              : lacking
                                ? 'border-madder bg-madder-soft text-madder'
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
                      <td className={row + ' text-right figures'}>
                        {formatAmount(line.unit.price)}
                      </td>
                      {discounts && (
                        <td
                          className={`${row} text-right leading-5 figures ${totals.withinLimit ? '' : 'text-madder'}`}
                        >
                          {!isZero(totals.discount) && (
                            <>
                              <span className="block font-semibold">
                                {text.minus(formatAmount(totals.discount))}
                              </span>
                              <span className="flex items-center justify-end gap-1 text-14 text-ink-2">
                                {totals.source === 'CODE' && (
                                  <>
                                    <Icon name="key" className="size-4 text-indigo" />
                                    <span className="sr-only">{labels.sales.code.onLine}</span>
                                  </>
                                )}
                                {text.pct(formatQty(totals.discountPct))}
                              </span>
                            </>
                          )}
                          {below.has(line.key) && line.suggestedPct && (
                            <span className="block text-14 font-semibold text-indigo">
                              {labels.register.suggestedPct(formatQty(line.suggestedPct))}
                            </span>
                          )}
                        </td>
                      )}
                      <td className={row + ' text-right font-semibold figures'}>
                        {formatAmount(totals.net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Totals
            quote={quote}
            draft={draft}
            toApply={toApply}
            onOrderDiscount={onOrderDiscount}
            onApplySuggested={onApplySuggested}
            onSave={onSave}
            onSubmit={onSubmit}
            onAsk={onAsk}
            onWithdraw={onWithdraw}
            busy={busy}
          />
        </>
      )}
    </section>
  );
}

type TotalsProps = Omit<DraftTableProps, 'onSelect' | 'customer'> & {
  quote: QuoteTotals;
  toApply: Suggested[];
};

function saveLabel(draft: DraftState, busy: TotalsProps['busy']): string {
  if (busy === 'save') return text.saving;
  return draft.saved ? text.saveChanges : text.save;
}

/**
 * Under the table, the totals (RG-DEV-05). The order discount is typed from here; under the
 * amount due, the quote is saved — once saved and unchanged, its PDF opened instead, the PDF
 * being always the quote as saved — and validated into an order, the last step (T-032). Beyond
 * the caps, a discount is asked of the owner from here (T-033b); a promo code is typed at the
 * register (H63).
 */
function Totals({
  quote,
  draft,
  toApply,
  onOrderDiscount,
  onApplySuggested,
  onSave,
  onSubmit,
  onAsk,
  onWithdraw,
  busy,
}: TotalsProps) {
  const [ordering, setOrdering] = useState(false);
  const discounts = useSalesDiscount();
  const upToDate = !!draft.saved && !unsavedChanges(draft);
  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-6 gap-y-2 border-t-2 border-ink px-4 py-2">
      {discounts && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOrdering(true)}
            className={buttonClass('secondary', 'md', 'shrink-0')}
          >
            <Icon name="percent" className="size-5" />
            {labels.sales.discount.order}
          </button>
          {toApply.length > 0 && (
            <button
              type="button"
              onClick={() => onApplySuggested(toApply)}
              className={buttonClass('primary', 'md', 'shrink-0')}
            >
              {labels.register.applySuggested}
            </button>
          )}
          <OwnerControls draft={draft} busy={busy} onAsk={onAsk} onWithdraw={onWithdraw} />
        </div>
      )}
      {/* The amount due, and under it the save: the last step, at the right hand's reach. */}
      <div className="ml-auto flex flex-col items-end gap-2">
        <TotalsList totals={quote} orderDiscountWrong={!quote.orderWithinLimit} />
        <div className="flex flex-wrap justify-end gap-2">
          {draft.saved && upToDate ? (
            <a
              href={quotesApi.pdfUrl(draft.saved.id)}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary', 'md')}
            >
              <Icon name="document" className="size-5" />
              {text.openPdf}
            </a>
          ) : (
            <button
              type="button"
              onClick={onSave}
              disabled={busy !== null}
              className={buttonClass('secondary', 'md')}
            >
              <Icon name="document" className="size-5" />
              {saveLabel(draft, busy)}
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy !== null}
            className={buttonClass('primary', 'md')}
          >
            <Icon name="check" className="size-5" />
            {busy === 'submit' ? text.submitting : text.submit}
          </button>
        </div>
      </div>
      {!quote.orderWithinLimit && (
        <p role="alert" className="flex basis-full items-start gap-2 font-semibold text-madder">
          <Icon name="alert" className="size-5 shrink-0 translate-y-px" />
          {labels.sales.discount.orderTooHigh(formatMga(quote.maxOrderDiscount))}
        </p>
      )}
      {ordering && (
        <OrderDiscountSheet
          draft={draft}
          onApply={onOrderDiscount}
          onClose={() => setOrdering(false)}
        />
      )}
    </div>
  );
}
