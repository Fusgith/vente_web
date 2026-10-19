import {
  CASH_METHOD,
  CREDIT_METHOD,
  formatMga,
  type InvoiceLookup,
  type PaymentMethod,
  type RefundedOrder,
} from '@vente-web/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { ApiError } from '../api/client.js';
import { creditNotesApi } from '../api/credit-notes.js';
import { errorMessage } from '../api/error-message.js';
import { paymentsApi } from '../api/payments.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';
import { RefundedSale } from './RefundedSale.js';

const text = labels.refund;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
/** RG-ANN-01: a reason of three characters at least, as the API checks. */
const REASON_MIN = 3;

/** Refusals after which the sale is looked up again. */
const REFRESH_ON = new Set([
  'ORDER_CHANGED',
  'ORDER_NOT_REFUNDABLE',
  'CREDIT_NOT_PENDING',
  'NETWORK_ERROR',
]);

interface RefundSheetProps {
  /** Once cancelled and refunded: the sale and its credit note, for the status line. */
  onRefunded: (sale: InvoiceLookup, done: RefundedOrder) => void;
  onClose: () => void;
}

/** What a partial delivery left to refund, while no credit note covers it yet (H37). */
function pendingCredit(sale: InvoiceLookup) {
  const { issue } = sale;
  return issue?.credit && !issue.credit.creditNote
    ? { issueId: issue.id, amount: issue.credit.amount }
    : null;
}

/** The method the customer paid with, when a single one; cash otherwise. */
function defaultMethod(sale: InvoiceLookup, methods: PaymentMethod[]): string {
  const paid = sale.payment.lines.length === 1 ? sale.payment.lines[0]!.method.code : CASH_METHOD;
  const method =
    methods.find((item) => item.code === paid) ?? methods.find((item) => item.code === CASH_METHOD);
  return method?.id ?? methods[0]?.id ?? '';
}

/**
 * Cancelling a paid sale before delivery (RG-ANN-02, H36): found by the number of its
 * invoice, cancelled with a reason and refunded whole by one method from this register, on the
 * manager's identifier and password typed on the spot (H57). The credit note, numbered, is then
 * at hand.
 * Delivered in part (H37): what is left is refunded by one method, the manager having decided.
 */
export function RefundSheet({ onRefunded, onClose }: RefundSheetProps) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [number, setNumber] = useState('');
  const [sale, setSale] = useState<InvoiceLookup | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  // Methods not loaded: stays in view, a search does not hide it.
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<RefundedOrder | null>(null);

  useEffect(() => {
    let live = true;
    paymentsApi.methods().then(
      // Money goes back: never on credit (H67).
      (list) => live && setMethods(list.filter((item) => item.code !== CREDIT_METHOD)),
      (error: unknown) => live && setLoadFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  const lookup = (value: string) =>
    creditNotesApi.lookup(value).then((found) => {
      setSale(found);
      setMethodId('');
    });

  const find = (event: FormEvent) => {
    event.preventDefault();
    if (!number.trim() || busy) return;
    setBusy(true);
    setFailure(null);
    setSale(null);
    lookup(number)
      .catch((error: unknown) => setFailure(errorMessage(error)))
      .finally(() => setBusy(false));
  };

  // Until the cashier picks one: the method paid with, whichever of the sale and the methods came last.
  const chosenId = methodId || (sale ? defaultMethod(sale, methods) : '');
  const method = methods.find((item) => item.id === chosenId) ?? null;
  const refundable = sale?.order.status === 'PAID';
  const partial = sale ? pendingCredit(sale) : null;
  const refunded =
    !busy && method !== null && (!method.requiresReference || reference.trim() !== '');
  const ready = partial
    ? refunded
    : refundable &&
      refunded &&
      reason.trim().length >= REASON_MIN &&
      username.trim() !== '' &&
      password !== '';

  const confirm = () => {
    if (!ready || !sale || !method) return;
    setBusy(true);
    setFailure(null);
    const refund = { methodId: method.id, reference: reference.trim() || null };
    (partial
      ? creditNotesApi.partialRefund(sale.order.id, { issueId: partial.issueId, refund })
      : creditNotesApi.refund(sale.order.id, {
          version: sale.order.version,
          reason: reason.trim(),
          refund,
          approval: { username: username.trim(), password },
        })
    )
      .then(
        (refunded) => {
          setDone(refunded);
          onRefunded(sale, refunded);
        },
        (error: unknown) => {
          setFailure(errorMessage(error));
          // The password is typed again, never kept after a refusal.
          setPassword('');
          // Changed elsewhere, or the reply lost after the refund: the sale as it now stands,
          // with its credit note to reprint when it went through.
          if (error instanceof ApiError && REFRESH_ON.has(error.code)) {
            return lookup(sale.invoice.number).catch(() => undefined);
          }
        },
      )
      .finally(() => setBusy(false));
  };

  const amount = sale ? formatMga(partial?.amount ?? sale.order.total) : '';
  return (
    <Sheet
      title={text.title}
      closeLabel={text.close}
      onClose={onClose}
      width="lg"
      initialFocus={field}
      bodyClassName="flex flex-col gap-4"
      footer={
        done ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={creditNotesApi.pdfUrl(done.creditNote.id)}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary', 'lg', 'flex-1')}
            >
              <Icon name="document" className="size-5" />
              {text.openCreditNote}
            </a>
            <button
              type="button"
              onClick={onClose}
              className={buttonClass('primary', 'lg', 'flex-1')}
            >
              {text.finish}
            </button>
          </div>
        ) : partial ? (
          <button
            type="button"
            onClick={confirm}
            disabled={!ready}
            className={buttonClass('primary', 'lg', 'w-full')}
          >
            {busy ? text.refunding : labels.issues.confirmPartial(amount)}
          </button>
        ) : refundable ? (
          <button
            type="button"
            onClick={confirm}
            disabled={!ready}
            className={buttonClass('destructive', 'lg', 'w-full')}
          >
            {busy ? text.refunding : text.confirm(amount)}
          </button>
        ) : undefined
      }
    >
      {!done && (
        <form onSubmit={find} className="flex flex-wrap items-end gap-2">
          <label htmlFor={`${id}-number`} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-semibold">{text.invoiceNumber}</span>
            <input
              id={`${id}-number`}
              ref={field}
              autoComplete="off"
              autoCapitalize="characters"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              className={`${FIELD} figures uppercase`}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !number.trim()}
            className={buttonClass('secondary', 'lg')}
          >
            {busy && !sale ? text.finding : text.find}
          </button>
        </form>
      )}
      {loadFailure && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {loadFailure}
        </p>
      )}
      {failure && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {failure}
        </p>
      )}
      {sale && <RefundedSale sale={sale} />}
      {sale && !refundable && !partial && !done && (
        <p role="status" className="rounded-control bg-cotton p-3 font-semibold">
          {text.notRefundable(sale.order.status)}
        </p>
      )}
      {sale && !done && sale.creditNotes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sale.creditNotes.map((note) => (
            <a
              key={note.id}
              href={creditNotesApi.pdfUrl(note.id)}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary', 'lg')}
            >
              <Icon name="document" className="size-5" />
              {text.creditNoteOf(note.number)}
            </a>
          ))}
        </div>
      )}
      {done && method && (
        <p role="status" className="rounded-control bg-cotton p-3 text-18 font-semibold">
          {text.done(done.creditNote.number, amount, method.label)}
        </p>
      )}
      {refundable && !done && (
        <>
          <label htmlFor={`${id}-reason`} className="font-semibold">
            {text.reason}
          </label>
          <textarea
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            rows={2}
            className="-mt-2 rounded-control border border-rule-strong bg-white p-3 text-18 text-ink"
          />
        </>
      )}
      {(refundable || partial) && !done && (
        <div className="flex flex-wrap gap-3">
          <label htmlFor={`${id}-method`} className="flex w-48 flex-col gap-1">
            <span className="font-semibold">{text.method}</span>
            <select
              id={`${id}-method`}
              value={chosenId}
              onChange={(event) => setMethodId(event.target.value)}
              className={FIELD}
            >
              {methods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {method?.requiresReference && (
            <label htmlFor={`${id}-reference`} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold">{text.reference}</span>
              <input
                id={`${id}-reference`}
                autoComplete="off"
                maxLength={80}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className={FIELD}
              />
            </label>
          )}
        </div>
      )}
      {refundable && !done && (
        <fieldset className="flex flex-wrap gap-3 rounded-control bg-cotton p-3">
          <legend className="float-left mb-1 w-full font-semibold">{text.approval}</legend>
          <label htmlFor={`${id}-manager`} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-14 text-ink-2">{text.manager}</span>
            <input
              id={`${id}-manager`}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={FIELD}
            />
          </label>
          <label htmlFor={`${id}-password`} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-14 text-ink-2">{text.password}</span>
            <input
              id={`${id}-password`}
              type="password"
              autoComplete="off"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD}
            />
          </label>
        </fieldset>
      )}
    </Sheet>
  );
}
