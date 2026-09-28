import {
  cashVariance,
  formatAmount,
  formatMga,
  type RegisterSession,
  type SessionSummary,
} from '@vente-web/shared';
import { useEffect, useId, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { paymentsApi } from '../api/payments.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { AmountHead } from '../ui/DocumentTable.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';
import { typedAmount } from './amount.js';

const text = labels.closing;

interface CloseRegisterSheetProps {
  session: RegisterSession;
  /** Resolves with the closed session, or null when refused. */
  onClose: (countedCash: string, note: string | null) => Promise<SessionSummary | null>;
  /** The sheet dismissed; `closed` once the session is closed. */
  onDone: (closed: boolean) => void;
}

/**
 * Closing the register (RG-CAI-03, H35): what each method took, the cash the drawer should
 * hold, the cash counted and the variance live, a comment required when it is not nil. Once
 * closed, the report is at hand.
 */
export function CloseRegisterSheet({ session, onClose, onDone }: CloseRegisterSheetProps) {
  const countedId = useId();
  const noteId = useId();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<SessionSummary | null>(null);

  useEffect(() => {
    let live = true;
    paymentsApi.summary().then(
      (next) => live && setSummary(next),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  const amount = typedAmount(counted);
  const variance = summary && amount !== null ? cashVariance(amount, summary.cashExpected) : null;
  const needsNote = variance !== null && variance !== '0.00';
  const ready = amount !== null && (!needsNote || note.trim() !== '') && !busy;

  const confirm = () => {
    if (!ready || amount === null) return;
    setBusy(true);
    void onClose(amount, note.trim() || null)
      .then((done) => setClosed(done))
      .finally(() => setBusy(false));
  };

  const shown = closed ?? summary;
  return (
    <Sheet
      title={text.closeTitle(session.station.name)}
      closeLabel={labels.register.close}
      onClose={() => onDone(closed !== null)}
      width="lg"
      bodyClassName="flex flex-col gap-4"
      footer={
        closed ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={paymentsApi.reportUrl(closed.id)}
              target="_blank"
              rel="noopener"
              className={buttonClass('secondary', 'lg', 'flex-1')}
            >
              <Icon name="document" className="size-5" />
              {text.report}
            </a>
            <button
              type="button"
              onClick={() => onDone(true)}
              className={buttonClass('primary', 'lg', 'flex-1')}
            >
              {text.done}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={confirm}
            disabled={!ready}
            className={buttonClass('destructive', 'lg', 'w-full')}
          >
            {busy ? text.closing : text.confirm}
          </button>
        )
      }
    >
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      {!shown && !failure && <p className="text-ink-2">{text.loading}</p>}
      {shown && (
        <>
          {shown.byMethod.length === 0 ? (
            <p className="text-ink-2">{text.none}</p>
          ) : (
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className={HEAD}>{text.method}</th>
                  <th className={`${HEAD} w-28 text-right`}>{text.payments}</th>
                  <AmountHead label={text.total} width="w-36" />
                </tr>
              </thead>
              <tbody>
                {shown.byMethod.map((method) => (
                  <tr key={method.code}>
                    <td className={`${CELL} h-12 border-b border-rule`}>{method.label}</td>
                    <td className={`${CELL} border-b border-rule text-right figures`}>
                      {method.count}
                    </td>
                    <td className={`${CELL} border-b border-rule text-right font-semibold figures`}>
                      {formatAmount(method.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1">
            <dt className="text-ink-2">{text.openingFloat}</dt>
            <dd className="text-right figures">{formatMga(shown.openingFloat)}</dd>
            <dt className="font-semibold">{text.cashExpected}</dt>
            <dd className="text-right text-24 font-bold figures">
              {formatMga(shown.cashExpected)}
            </dd>
          </dl>
          {closed ? (
            <p className="rounded-control bg-cotton p-3 font-semibold" role="status">
              {labels.closing.closed(
                closed.station.name,
                closed.variance && closed.variance !== '0.00' ? formatMga(closed.variance) : null,
              )}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4 rounded-control bg-cotton p-3">
                <label htmlFor={countedId} className="flex w-56 flex-col gap-1">
                  <span className="text-14 text-ink-2">{text.counted}</span>
                  <input
                    id={countedId}
                    inputMode="decimal"
                    autoComplete="off"
                    value={counted}
                    onChange={(event) => setCounted(event.target.value)}
                    className="h-12 rounded-control border border-rule-strong bg-white px-3 text-right text-24 font-semibold figures"
                  />
                </label>
                {variance !== null && (
                  <p className="ml-auto flex flex-col items-end">
                    <span className="text-14 text-ink-2">{text.variance}</span>
                    <output
                      aria-label={text.variance}
                      className={`text-36 font-bold figures ${needsNote ? 'text-madder' : ''}`}
                    >
                      {needsNote ? formatMga(variance) : text.exact}
                    </output>
                  </p>
                )}
              </div>
              <label htmlFor={noteId} className="font-semibold">
                {needsNote ? text.noteRequired : text.note}
              </label>
              <textarea
                id={noteId}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                rows={2}
                className="rounded-control border border-rule-strong bg-white p-3 text-18 text-ink"
              />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
