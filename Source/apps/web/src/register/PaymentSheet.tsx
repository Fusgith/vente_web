import {
  CASH_METHOD,
  formatMga,
  formatQty,
  roundCash,
  settle,
  type Order,
  type PaymentInput,
  type PaymentMethod,
} from '@vente-web/shared';
import { useEffect, useId, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { paymentsApi } from '../api/payments.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';
import { typedAmount } from './amount.js';

const text = labels.register;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

interface Line {
  key: number;
  methodId: string;
  amount: string;
  reference: string;
}

/** An amount due as it starts a field: `65 000`, `12 500,5` (RG-FMT-01). */
const editable = (amount: string) => (amount.startsWith('-') ? '' : formatQty(amount));

interface PaymentSheetProps {
  order: Order;
  ticket: string;
  busy: boolean;
  /** Resolves true once paid; `key` is this payment's, whatever the retries. */
  onPay: (input: PaymentInput, key: string) => Promise<boolean>;
  onClose: () => void;
}

/**
 * The payment of the order at the register (RG-PAY-01 à 04, H32): cash by default for the
 * whole amount; other methods added for a mixed payment, each with its reference when required;
 * on the cash part, the cash handed over and the change. Confirmed only once the lines add up
 * exactly to the amount due — the same check as the API's (`settle`).
 */
export function PaymentSheet({ order, ticket, busy, onPay, onClose }: PaymentSheetProps) {
  const [key] = useState(() => crypto.randomUUID());
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [received, setReceived] = useState('');
  const receivedId = useId();

  useEffect(() => {
    let live = true;
    paymentsApi.checkout().then(
      ({ methods: list, cashRounding }) => {
        if (!live) return;
        setMethods(list);
        setStep(cashRounding);
        const first = list.find((method) => method.code === CASH_METHOD) ?? list[0];
        // In cash, the amount rounded to the shop step (RG-FMT-04, H70).
        const due =
          first?.code === CASH_METHOD ? roundCash(order.total, cashRounding) : order.total;
        if (first) setLines([{ key: 0, methodId: first.id, amount: editable(due), reference: '' }]);
      },
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
    // The amount due of the order opened: a change of it closes the sheet (new version).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const methodOf = (line: Line) => methods?.find((method) => method.id === line.methodId);
  const amounts = lines.map((line) => typedAmount(line.amount));
  const hasCash = lines.some((line) => methodOf(line)?.code === CASH_METHOD);
  // The cash received counts only with a cash line: left typed after one is removed, it is ignored.
  const receivedTyped = hasCash && received.trim() !== '';
  const cashTyped = receivedTyped ? typedAmount(received) : null;
  const readable =
    amounts.every((amount) => amount !== null) && (!receivedTyped || cashTyped !== null);
  // Every line takes something: a line at zero is removed, never sent (RG-PAY-02).
  const allPositive = amounts.every((amount) => amount !== null && /[1-9]/.test(amount));
  const settled = settle(
    order.total,
    lines.map((line, index) => ({
      amount: amounts[index] ?? '0',
      cash: methodOf(line)?.code === CASH_METHOD,
    })),
    cashTyped,
    step,
  );
  const missingReference = lines.some(
    (line) => methodOf(line)?.requiresReference && line.reference.trim() === '',
  );
  const ready =
    readable && allPositive && settled.issue === null && !missingReference && lines.length > 0;

  const update = (key: number, change: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  const add = () => {
    const used = new Set(lines.map((line) => line.methodId));
    const method = methods?.find((candidate) => !used.has(candidate.id)) ?? methods?.[0];
    if (!method) return;
    const next = Math.max(...lines.map((line) => line.key)) + 1;
    setLines([
      ...lines,
      { key: next, methodId: method.id, amount: editable(settled.remaining), reference: '' },
    ]);
  };
  const pay = () => {
    if (!ready) return;
    void onPay(
      {
        version: order.version,
        lines: lines.map((line, index) => ({
          methodId: line.methodId,
          amount: amounts[index] ?? '0',
          reference: line.reference.trim() || null,
        })),
        cashReceived: hasCash ? cashTyped : null,
      },
      key,
    );
  };

  const remaining = settled.remaining;
  const issue =
    readable && settled.issue && settled.issue !== 'TOTAL_MISMATCH'
      ? text.payIssues[settled.issue]
      : null;

  return (
    <Sheet
      title={text.payTitle(ticket, order.customer.name)}
      closeLabel={text.close}
      onClose={onClose}
      width="lg"
      bodyClassName="flex flex-col gap-4"
      footer={
        <button
          type="button"
          onClick={pay}
          disabled={busy || !ready}
          className={buttonClass('primary', 'lg', 'w-full')}
        >
          <Icon name="check" className="size-5" />
          {busy ? text.paying : text.confirmPay(formatMga(settled.due))}
        </button>
      }
    >
      <p className="flex items-baseline justify-between gap-4">
        <span className="text-18 font-semibold">{text.amountDue}</span>
        <span className="text-36 font-bold figures">{formatMga(order.total)}</span>
      </p>
      {settled.rounding !== '0.00' && (
        <p className="-mt-3 text-right font-semibold figures">
          {text.cashRounding(
            settled.rounding.startsWith('-')
              ? `−${formatMga(settled.rounding.slice(1))}`
              : `+${formatMga(settled.rounding)}`,
            formatMga(settled.due),
          )}
        </p>
      )}
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const method = methodOf(line);
          return (
            <li key={line.key} className="flex flex-wrap items-end gap-2 border-b border-rule pb-3">
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-14 text-ink-2">{text.method}</span>
                <select
                  value={line.methodId}
                  onChange={(event) => update(line.key, { methodId: event.target.value })}
                  className={FIELD}
                >
                  {methods?.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex w-44 flex-col gap-1">
                <span className="text-14 text-ink-2">{text.lineAmount}</span>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={line.amount}
                  aria-invalid={amounts[index] === null}
                  onChange={(event) => update(line.key, { amount: event.target.value })}
                  className={`${FIELD} text-right font-semibold figures`}
                />
              </label>
              {method?.requiresReference && (
                <label className="flex min-w-48 flex-1 flex-col gap-1">
                  <span className="text-14 text-ink-2">{text.reference}</span>
                  <input
                    autoComplete="off"
                    maxLength={80}
                    value={line.reference}
                    aria-invalid={line.reference.trim() === ''}
                    onChange={(event) => update(line.key, { reference: event.target.value })}
                    className={FIELD}
                  />
                </label>
              )}
              {lines.length > 1 && (
                <button
                  type="button"
                  aria-label={text.removeMethod(method?.label ?? '')}
                  onClick={() => setLines(lines.filter((candidate) => candidate.key !== line.key))}
                  className={buttonClass('secondary', 'md', 'size-12 px-0')}
                >
                  <Icon name="trash" className="size-5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {methods && methods.length > 1 && (
        <button
          type="button"
          onClick={add}
          className={buttonClass('secondary', 'md', 'self-start')}
        >
          {text.addMethod}
        </button>
      )}
      {hasCash && (
        <div className="flex flex-wrap items-end gap-4 rounded-control bg-cotton p-3">
          <label htmlFor={receivedId} className="flex w-56 flex-col gap-1">
            <span className="text-14 text-ink-2">{text.cashReceived}</span>
            <input
              id={receivedId}
              inputMode="decimal"
              autoComplete="off"
              placeholder={formatQty(settled.cashPart)}
              value={received}
              onChange={(event) => setReceived(event.target.value)}
              className={`${FIELD} text-right text-24 font-semibold figures`}
            />
          </label>
          <p className="ml-auto flex flex-col items-end">
            <span className="text-14 text-ink-2">{text.change}</span>
            <output className="text-36 font-bold figures" aria-label={text.change}>
              {formatMga(settled.change)}
            </output>
          </p>
        </div>
      )}
      {readable && remaining !== '0.00' && (
        <p className="flex items-baseline justify-between font-semibold text-madder">
          <span>{remaining.startsWith('-') ? text.overpaid : text.remaining}</span>
          <span className="figures">{formatMga(remaining.replace('-', ''))}</span>
        </p>
      )}
      {issue && (
        <p role="alert" className="font-semibold text-madder">
          {issue}
        </p>
      )}
    </Sheet>
  );
}
