import {
  formatAmount,
  formatDate,
  formatMga,
  isTermMethod,
  type InstrumentOutcome,
  type PaymentMethod,
  type Receivable,
  type ReceivableList,
  type ReceivablePayment,
} from '@vente-web/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { creditApi } from '../api/credit.js';
import { errorMessage } from '../api/error-message.js';
import { paymentsApi } from '../api/payments.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { Icon } from '../ui/Icon.js';
import { typedAmount } from './amount.js';

const text = labels.credit;
const ROW = `${CELL} border-b border-rule py-2 align-middle`;
const FIELD = 'min-h-12 rounded-control border border-rule-strong bg-white px-3';

/**
 * What the customers still owe on their credit sales (T-095, ⚠️ H67), the earliest due first.
 * At the register, a payment towards one is taken with a numbered receipt; the owner reads.
 * A bill of exchange or a post-dated check (T-096, ⚠️ H73) is not taken at the register while
 * in hand: the manager says whether the bank paid it (`canMark`).
 */
export function ReceivablesPanel({
  canSettle,
  canMark = false,
}: {
  canSettle: boolean;
  canMark?: boolean;
}) {
  const { say } = useStatusLine();
  const [list, setList] = useState<ReceivableList | null>(null);
  const [q, setQ] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [settling, setSettling] = useState<Receivable | null>(null);
  const [methodId, setMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [done, setDone] = useState<ReceivablePayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const fail = (error: unknown) => setFailure(errorMessage(error));

  const load = useCallback((search: string) => {
    creditApi.receivables(search).then(setList, fail);
  }, []);
  useEffect(() => {
    load('');
    if (!canSettle) return;
    paymentsApi.methods().then((all) => {
      const usable = all.filter((item) => !isTermMethod(item.code));
      setMethods(usable);
      setMethodId(usable[0]?.id ?? '');
    }, fail);
  }, [canSettle, load]);

  const method = methods.find((item) => item.id === methodId);
  const open = (receivable: Receivable) => {
    setSettling(receivable);
    setAmount(receivable.remaining);
    setReference('');
    setFailure(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = typedAmount(amount);
    if (!settling || !value) return;
    setBusy(true);
    creditApi
      .settle(settling.id, { methodId, amount: value, reference: reference.trim() || null })
      .then((payment) => {
        setDone(payment);
        setSettling(null);
        setFailure(null);
        say(text.settled(payment.number), 'check');
        load(q);
      }, fail)
      .finally(() => setBusy(false));
  };

  const mark = (receivable: Receivable, outcome: InstrumentOutcome) => {
    setBusy(true);
    creditApi
      .markInstrument(receivable.id, outcome)
      .then((marked) => {
        setFailure(null);
        say(text.marked(marked.customer.name, text.instrumentStatus[outcome]), 'check');
        load(q);
      }, fail)
      .finally(() => setBusy(false));
  };

  return (
    <section
      aria-labelledby="receivables"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="receivables" className="type-title">
          {text.receivablesTitle}
        </h2>
        <p className="text-ink-2">{text.receivablesIntro}</p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load(q);
        }}
        className="flex flex-wrap items-end gap-3 px-4"
      >
        <label className="flex flex-col gap-1">
          {text.search}
          <input value={q} onChange={(event) => setQ(event.target.value)} className={FIELD} />
        </label>
        <button type="submit" className={buttonClass('secondary', 'md')}>
          {text.searchGo}
        </button>
      </form>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {done && (
        <a
          href={creditApi.receiptPdfUrl(done.id)}
          target="_blank"
          rel="noopener"
          className={buttonClass('secondary', 'md', 'mx-4 self-start')}
        >
          <Icon name="document" className="size-5" />
          {text.openReceipt} {done.number}
        </a>
      )}
      {list && (
        <p className="px-4 font-semibold figures">
          {text.total(formatMga(list.totals.remaining), formatMga(list.totals.overdue))}
        </p>
      )}
      {list?.items.length === 0 && <p className="px-4 text-ink-2">{text.noReceivable}</p>}
      {list && list.items.length > 0 && (
        <div className="overflow-x-auto">
          <table
            aria-label={text.receivablesTitle}
            className="w-full border-separate border-spacing-0 text-left"
          >
            <thead>
              <tr>
                <th className={HEAD}>{text.customer}</th>
                <th className={HEAD}>{text.invoice}</th>
                <th className={HEAD}>{text.dueOn}</th>
                <th className={`${HEAD} text-right`}>{text.remaining}</th>
                {(canSettle || canMark) && <th className={HEAD} />}
              </tr>
            </thead>
            <tbody>
              {list.items.map((receivable) => (
                <tr key={receivable.id}>
                  <td className={`${ROW} font-semibold`}>
                    {receivable.customer.name}
                    <span className="block text-14 font-normal text-ink-2">
                      {receivable.customer.phone}
                    </span>
                  </td>
                  <td className={`${ROW} figures`}>
                    {receivable.invoice.number}
                    {receivable.instrument && (
                      <span className="block text-14 text-ink-2">
                        {text.instrument(
                          receivable.instrument.method,
                          receivable.instrument.number,
                          receivable.instrument.bank,
                        )}{' '}
                        — {text.instrumentStatus[receivable.instrument.status]}
                      </span>
                    )}
                  </td>
                  <td className={`${ROW} figures ${receivable.overdue ? 'text-madder' : ''}`}>
                    {formatDate(receivable.dueOn)}
                    {receivable.overdue && ` — ${text.overdue}`}
                  </td>
                  <td className={`${ROW} text-right figures`}>
                    {formatAmount(receivable.remaining)}
                  </td>
                  {(canSettle || canMark) && (
                    <td className={`${ROW} whitespace-nowrap`}>
                      {receivable.instrument?.status === 'HANDED'
                        ? canMark && (
                            <span className="flex gap-2">
                              <button
                                type="button"
                                aria-label={text.cashedOf(receivable.customer.name)}
                                disabled={busy}
                                onClick={() => mark(receivable, 'CASHED')}
                                className={buttonClass('secondary', 'md')}
                              >
                                {text.cashed}
                              </button>
                              <button
                                type="button"
                                aria-label={text.unpaidOf(receivable.customer.name)}
                                disabled={busy}
                                onClick={() => mark(receivable, 'UNPAID')}
                                className={buttonClass('destructive', 'md')}
                              >
                                {text.unpaid}
                              </button>
                            </span>
                          )
                        : canSettle && (
                            <button
                              type="button"
                              aria-label={text.settleOf(receivable.customer.name)}
                              disabled={busy}
                              onClick={() => open(receivable)}
                              className={buttonClass('secondary', 'md')}
                            >
                              {text.settle}
                            </button>
                          )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {settling && (
        <form
          onSubmit={submit}
          aria-label={text.settleOf(settling.customer.name)}
          className="flex flex-wrap items-end gap-3 border-t border-rule px-4 pt-3"
        >
          <p className="w-full font-semibold">
            {settling.customer.name} — {settling.invoice.number}
          </p>
          <label className="flex flex-col gap-1">
            {text.method}
            <select
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
          <label className="flex flex-col gap-1">
            {text.amount}
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={`${FIELD} figures w-40`}
            />
          </label>
          {method?.requiresReference && (
            <label className="flex flex-col gap-1">
              {text.reference}
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className={FIELD}
              />
            </label>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              !typedAmount(amount) ||
              (method?.requiresReference === true && !reference.trim())
            }
            className={buttonClass('primary', 'md')}
          >
            {text.confirm}
          </button>
          <button
            type="button"
            onClick={() => setSettling(null)}
            className={buttonClass('secondary', 'md')}
          >
            {text.cancel}
          </button>
        </form>
      )}
    </section>
  );
}
