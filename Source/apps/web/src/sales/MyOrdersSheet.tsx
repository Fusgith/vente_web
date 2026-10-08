import { formatAmount, ticketLabel, type OrderSummary } from '@vente-web/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { ordersApi } from '../api/orders.js';
import { quotesApi } from '../api/quotes.js';
import { labels } from '../labels.js';
import { useRealtimeEvent } from '../realtime/context.js';
import { CancelOrderSheet } from '../register/CancelOrderSheet.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.mine;
const ROW = `${CELL} h-16 border-b border-rule py-1`;
const TAG = 'mt-0.5 block text-14 text-ink-2';
/** Refusals that make the expired order a quote again, to take up (H56). */
const BACK_TO_QUOTE = new Set([
  'ORDER_PRICE_CHANGED',
  'STOCK_UNAVAILABLE',
  'QUOTE_DISCOUNT_BEYOND_CAP',
]);

interface MyOrdersSheetProps {
  /** The screen's quote has changes not saved: taking up another asks first. */
  unsaved: boolean;
  /**
   * Puts the quote on the screen; rejects when it could not be read. Resolves with the sentence to
   * say when it differs from the usual one (discounts removed, H60).
   */
  onTakeUp: (id: string) => Promise<string | void>;
  onClose: () => void;
}

/**
 * The salesperson's quotes and orders not paid (T-035b, RG-DEV-02/03, RG-CMD-05b/08, H56): a quote
 * taken up again — a colleague's found by its number — an order cancelled with its reason, an
 * expired one reactivated. Read again whenever one of them changes state.
 */
export function MyOrdersSheet({ unsaved, onTakeUp, onClose }: MyOrdersSheetProps) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const { say, sayError } = useStatusLine();
  const [term, setTerm] = useState('');
  const [searched, setSearched] = useState('');
  const [reads, setReads] = useState(0);
  const [rows, setRows] = useState<OrderSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState<OrderSummary | null>(null);
  const [cancelling, setCancelling] = useState<OrderSummary | null>(null);

  useEffect(() => {
    let live = true;
    quotesApi.list(searched || undefined).then(
      (orders) => live && setRows(orders),
      (error: unknown) => live && sayError(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, [searched, reads, sayError]);
  const readAgain = () => setReads((count) => count + 1);
  useRealtimeEvent('order.status_changed', readAgain);

  const find = (event: FormEvent) => {
    event.preventDefault();
    setSearched(term.trim());
  };
  const showAll = () => {
    setTerm('');
    setSearched('');
  };

  async function takeUp(row: OrderSummary) {
    setReplacing(null);
    setBusy(true);
    try {
      const note = await onTakeUp(row.id);
      say(note || text.takenUp(row.number), 'check');
      onClose();
    } catch (error) {
      sayError(errorMessage(error));
      setBusy(false);
    }
  }

  async function reactivate(row: OrderSummary) {
    setBusy(true);
    try {
      const order = await ordersApi.reactivate(row.id, row.version);
      const ticket = order.ticket ? ticketLabel(order.ticket) : order.number;
      say(text.reactivated(ticket, order.customer.name), 'check');
    } catch (error) {
      const back = error instanceof ApiError && BACK_TO_QUOTE.has(error.code);
      sayError(
        back ? `${errorMessage(error)} ${text.becameQuote(row.number)}` : errorMessage(error),
      );
    } finally {
      setBusy(false);
      readAgain();
    }
  }

  async function cancel(row: OrderSummary, reason: string) {
    setBusy(true);
    try {
      await ordersApi.cancel(row.id, row.version, reason);
      say(labels.register.cancelled(ticketOf(row), row.customer.name), 'check');
      setCancelling(null);
    } catch (error) {
      sayError(errorMessage(error));
    } finally {
      setBusy(false);
      readAgain();
    }
  }

  function action(row: OrderSummary) {
    const small = buttonClass('secondary', 'md');
    switch (row.status) {
      case 'DRAFT':
        return (
          <button
            type="button"
            className={small}
            disabled={busy}
            aria-label={text.takeUpOf(row.number)}
            onClick={() => (unsaved ? setReplacing(row) : void takeUp(row))}
          >
            {text.takeUp}
          </button>
        );
      case 'EXPIRED':
        return (
          <button
            type="button"
            className={small}
            disabled={busy}
            aria-label={text.reactivateOf(row.number)}
            onClick={() => void reactivate(row)}
          >
            {text.reactivate}
          </button>
        );
      default:
        return (
          <button
            type="button"
            className={buttonClass('destructive', 'md')}
            disabled={busy}
            aria-label={text.cancelOf(row.number)}
            onClick={() => setCancelling(row)}
          >
            {text.cancel}
          </button>
        );
    }
  }

  return (
    <>
      <Sheet
        title={text.title}
        closeLabel={text.close}
        onClose={onClose}
        width="xl"
        initialFocus={field}
        bodyClassName="flex flex-col gap-4"
      >
        <form onSubmit={find} className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="focus-within-ring flex min-h-14 items-center gap-2 rounded-control border border-rule-strong bg-white px-3">
              <Icon name="search" className="size-6 text-ink-2" />
              <input
                ref={field}
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                aria-label={text.search}
                placeholder={text.search}
                aria-describedby={`${id}-hint`}
                autoComplete="off"
                enterKeyHint="search"
                className="h-13 min-w-0 flex-1 bg-transparent text-18 text-ink outline-none"
              />
            </div>
            <p id={`${id}-hint`} className="text-14 text-ink-2">
              {text.searchHint}
            </p>
          </div>
          <button type="submit" className={buttonClass('primary', 'lg')}>
            {text.find}
          </button>
          {searched && (
            <button type="button" className={buttonClass('secondary', 'lg')} onClick={showAll}>
              {text.showAll}
            </button>
          )}
        </form>

        {replacing && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-control border border-rule-strong p-4"
          >
            <p className="font-semibold">{text.replaceTitle}</p>
            <p className="text-ink-2">{text.replaceHint(replacing.number)}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass('destructive', 'md')}
                onClick={() => void takeUp(replacing)}
              >
                {text.replace}
              </button>
              <button
                type="button"
                className={buttonClass('secondary', 'md')}
                onClick={() => setReplacing(null)}
              >
                {text.keep}
              </button>
            </div>
          </div>
        )}

        {rows === null ? (
          <p className="text-ink-2">{text.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-ink-2">{searched ? text.notFound(searched) : text.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label={text.list}
              className="w-full min-w-[40rem] table-fixed border-separate border-spacing-0 text-left"
            >
              <thead>
                <tr>
                  <th className={`${HEAD} w-40`}>{text.head.number}</th>
                  <th className={HEAD}>{text.head.customer}</th>
                  <th className={`${HEAD} w-44`}>{text.head.status}</th>
                  <th className={`${HEAD} w-36 text-right`}>{text.head.total}</th>
                  <th className={`${HEAD} w-36`} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={`${ROW} figures font-semibold`}>
                      {row.number}
                      {row.ticket && (
                        <span className={`${TAG} font-normal`}>
                          {text.ticket(ticketLabel(row.ticket))}
                        </span>
                      )}
                    </td>
                    <td className={ROW}>
                      {row.customer.name}
                      {searched && <span className={TAG}>{text.by(row.salesUser.fullName)}</span>}
                    </td>
                    <td className={ROW}>
                      {text.status[row.status as keyof typeof text.status] ?? row.status}
                      {row.status === 'DRAFT' && row.ticket && (
                        <span className={TAG}>{text.sentBack}</span>
                      )}
                      {row.outdated && <span className={TAG}>{text.outdated}</span>}
                    </td>
                    <td className={`${ROW} figures text-right`}>{formatAmount(row.total)}</td>
                    <td className={`${ROW} text-right`}>{action(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
      {cancelling && (
        <CancelOrderSheet
          ticket={ticketOf(cancelling)}
          name={cancelling.customer.name}
          busy={busy}
          onCancel={(reason) => void cancel(cancelling, reason)}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  );
}

const ticketOf = (row: OrderSummary) => (row.ticket ? ticketLabel(row.ticket) : row.number);
