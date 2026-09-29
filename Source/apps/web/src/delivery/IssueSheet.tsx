import {
  ISSUE_CAUSES,
  formatQty,
  isQuantity,
  type IssueCause,
  type IssueLine,
  type Order,
} from '@vente-web/shared';
import { useId, useState } from 'react';

import { deliveriesApi } from '../api/deliveries.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.issues;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

interface Entry {
  qty: string;
  cause: IssueCause;
}

interface IssueSheetProps {
  order: Order;
  ticket: string;
  /** Reported: the order left the counter, waiting on the manager. */
  onReported: (order: Order) => void;
  onClose: () => void;
}

/** A typed quantity, the comma as decimal mark: « 1,5 » → « 1.5 »; empty stays empty. */
const typed = (value: string) => value.trim().replace(',', '.');

/**
 * A line missing or damaged (RG-LIV-04, ⚠️ H37): for each line touched, the quantity that
 * cannot be handed over — in its sale unit, at most what was ordered — and why, with a comment
 * if need be. The manager decides; the counter is free at once for the next order.
 */
export function IssueSheet({ order, ticket, onReported, onClose }: IssueSheetProps) {
  const id = useId();
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const entry = (position: number): Entry => entries[position] ?? { qty: '', cause: 'MISSING' };
  const change = (position: number, patch: Partial<Entry>) =>
    setEntries((current) => ({ ...current, [position]: { ...entry(position), ...patch } }));

  const lines: IssueLine[] = order.lines.flatMap((line) => {
    const { qty, cause } = entry(line.position);
    return typed(qty) ? [{ position: line.position, qty: typed(qty), cause }] : [];
  });
  const valid = lines.every((line) => isQuantity(line.qty));
  const tooMany = lines.some((line) => {
    const ordered = order.lines.find((candidate) => candidate.position === line.position);
    return !ordered || Number(line.qty) > Number(ordered.qty);
  });
  const ready = !busy && lines.length > 0 && valid && !tooMany;

  const send = () => {
    if (!ready) return;
    setBusy(true);
    setFailure(null);
    deliveriesApi
      .reportIssue(order.id, { version: order.version, lines, note: note.trim() || null })
      .then(onReported, (error: unknown) => setFailure(errorMessage(error)))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet
      title={text.reportTitle(ticket, order.customer.name)}
      closeLabel={text.close}
      onClose={onClose}
      width="lg"
      bodyClassName="flex flex-col gap-4"
      footer={
        <button
          type="button"
          onClick={send}
          disabled={!ready}
          className={buttonClass('primary', 'lg', 'w-full')}
        >
          {busy ? text.sending : text.send}
        </button>
      }
    >
      <p className="text-ink-2">{text.reportHelp}</p>
      <ul className="flex flex-col border-t border-rule">
        {order.lines.map((line) => {
          const { qty, cause } = entry(line.position);
          return (
            <li
              key={line.productUnitId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule py-3"
            >
              <span className="min-w-0 flex-1 leading-5">
                <span className="block font-semibold">{line.name}</span>
                <span className="block text-ink-2 figures">
                  {formatQty(line.qty)} {line.unitLabel}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <input
                  aria-label={text.notHandedOverOf(line.position)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={qty}
                  onChange={(event) => change(line.position, { qty: event.target.value })}
                  className={`${FIELD} w-24 text-right figures`}
                />
                <span className="text-ink-2">{text.ordered(formatQty(line.qty))}</span>
              </span>
              <select
                aria-label={text.causeOf(line.position)}
                value={cause}
                onChange={(event) =>
                  change(line.position, { cause: event.target.value as IssueCause })
                }
                className={`${FIELD} w-36`}
              >
                {ISSUE_CAUSES.map((value) => (
                  <option key={value} value={value}>
                    {text.causes[value]}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      {tooMany && (
        <p role="alert" className="font-semibold text-madder">
          {text.tooMany}
        </p>
      )}
      <label htmlFor={`${id}-note`} className="font-semibold">
        {text.note}
      </label>
      <textarea
        id={`${id}-note`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={300}
        rows={2}
        className="-mt-2 rounded-control border border-rule-strong bg-white p-3 text-18 text-ink"
      />
      {failure && (
        <p
          role="alert"
          className="rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
        >
          {failure}
        </p>
      )}
    </Sheet>
  );
}
