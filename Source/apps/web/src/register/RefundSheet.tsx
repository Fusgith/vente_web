import {
  CASH_METHOD,
  formatMga,
  type InvoiceLookup,
  type PaymentMethod,
  type RefundedOrder,
} from '@vente-web/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

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
const PIN = /^\d{4,6}$/;

interface RefundSheetProps {
  /** Once cancelled and refunded: the sale and its credit note, for the status line. */
  onRefunded: (sale: InvoiceLookup, done: RefundedOrder) => void;
  onClose: () => void;
}

/** The method the customer paid with, when a single one; cash otherwise. */
function defaultMethod(sale: InvoiceLookup, methods: PaymentMethod[]): string {
  const paid = sale.payment.lines.length === 1 ? sale.payment.lines[0]!.method.code : CASH_METHOD;
  const method =
    methods.find((item) => item.code === paid) ?? methods.find((item) => item.code === CASH_METHOD);
  return method?.id ?? methods[0]?.id ?? '';
}

/**
 * Cancelling a paid sale before delivery (RG-ANN-02, ⚠️ H36): found by the number of its
 * invoice, cancelled with a reason and refunded whole by one method from this register, on the
 * manager's name and PIN typed on the spot. The credit note, numbered, is then at hand.
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
  const [pin, setPin] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<RefundedOrder | null>(null);

  useEffect(() => {
    let live = true;
    paymentsApi.methods().then(
      (list) => live && setMethods(list),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  const find = (event: FormEvent) => {
    event.preventDefault();
    if (!number.trim() || busy) return;
    setBusy(true);
    setFailure(null);
    setSale(null);
    creditNotesApi
      .lookup(number)
      .then(
        (found) => {
          setSale(found);
          setMethodId(defaultMethod(found, methods));
        },
        (error: unknown) => setFailure(errorMessage(error)),
      )
      .finally(() => setBusy(false));
  };

  const method = methods.find((item) => item.id === methodId) ?? null;
  const refundable = sale?.order.status === 'PAID';
  const ready =
    refundable &&
    !busy &&
    method !== null &&
    (!method.requiresReference || reference.trim() !== '') &&
    reason.trim().length >= REASON_MIN &&
    username.trim() !== '' &&
    PIN.test(pin);

  const confirm = () => {
    if (!ready || !sale || !method) return;
    setBusy(true);
    setFailure(null);
    creditNotesApi
      .refund(sale.order.id, {
        version: sale.order.version,
        reason: reason.trim(),
        refund: { methodId: method.id, reference: reference.trim() || null },
        approval: { username: username.trim(), pin },
      })
      .then(
        (refunded) => {
          setDone(refunded);
          onRefunded(sale, refunded);
        },
        (error: unknown) => {
          setFailure(errorMessage(error));
          // The PIN is typed again, never kept after a refusal.
          setPin('');
        },
      )
      .finally(() => setBusy(false));
  };

  const amount = sale ? formatMga(sale.order.total) : '';
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
      {failure && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {failure}
        </p>
      )}
      {sale && <RefundedSale sale={sale} />}
      {sale && !refundable && !done && (
        <p role="status" className="rounded-control bg-cotton p-3 font-semibold">
          {text.notRefundable(sale.order.status)}
        </p>
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
          <div className="flex flex-wrap gap-3">
            <label htmlFor={`${id}-method`} className="flex w-48 flex-col gap-1">
              <span className="font-semibold">{text.method}</span>
              <select
                id={`${id}-method`}
                value={methodId}
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
          <fieldset className="flex flex-wrap gap-3 rounded-control bg-cotton p-3">
            <legend className="float-left mb-1 w-full font-semibold">{text.approval}</legend>
            <label htmlFor={`${id}-manager`} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-14 text-ink-2">{text.manager}</span>
              <input
                id={`${id}-manager`}
                autoComplete="off"
                autoCapitalize="none"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={FIELD}
              />
            </label>
            <label htmlFor={`${id}-pin`} className="flex w-40 flex-col gap-1">
              <span className="text-14 text-ink-2">{text.pin}</span>
              <input
                id={`${id}-pin`}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                className={`${FIELD} figures tracking-[0.3em]`}
              />
            </label>
          </fieldset>
        </>
      )}
    </Sheet>
  );
}
