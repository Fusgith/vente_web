import { CREDIT_REFUSAL_LABEL, formatMga, formatTime, type CreditRequest } from '@vente-web/shared';
import { useCallback, useEffect, useState } from 'react';

import { creditApi } from '../api/credit.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';

const text = labels.credit;
const FIELD =
  'h-12 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const DEFAULT_DAYS = '30';

/**
 * The credits the conditions refused, asked by the register (T-095b, H67, ⚠️ H76): the owner
 * grants each with its days to settle, or refuses it; the manager reads them. Shown only while
 * some wait.
 */
export function CreditRequestsPanel({ editable }: { editable: boolean }) {
  const { say } = useStatusLine();
  const [pending, setPending] = useState<CreditRequest[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [days, setDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    creditApi.creditRequests().then(
      (list) => {
        setPending(list.pending);
        setFailure(null);
      },
      (error: unknown) => setFailure(errorMessage(error)),
    );
  }, []);
  useEffect(load, [load]);
  useRealtimeEvent('credit.request_created', load);
  useRealtimeEvent('credit.request_decided', load);
  useRealtimeConnect(load);

  const decide = (request: CreditRequest, grant: boolean) => {
    const typed = Number(days[request.id] ?? DEFAULT_DAYS);
    if (grant && !(Number.isInteger(typed) && typed >= 1 && typed <= 365)) {
      setFailure(text.daysInvalid);
      return;
    }
    setBusy(request.id);
    creditApi
      .decideCredit(request.id, grant ? typed : null)
      .then(
        (closed) => {
          setPending((list) => list.filter((kept) => kept.id !== closed.id));
          setFailure(null);
          say((grant ? text.granted : text.rejected)(closed.customer.name), 'check');
        },
        (error: unknown) => {
          setFailure(errorMessage(error));
          load();
        },
      )
      .finally(() => setBusy(null));
  };

  if (pending.length === 0 && !failure) return null;
  return (
    <section
      aria-labelledby="credit-requests"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="credit-requests" className="type-title">
          {text.requestsTitle}
        </h2>
        {editable && <p className="text-ink-2">{text.requestsHelp}</p>}
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      <ul className="flex flex-col">
        {pending.map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-end gap-3 border-t border-rule px-4 py-3"
          >
            <div className="flex min-w-60 flex-1 flex-col gap-1">
              <span className="font-semibold">
                {request.customer.name} — {request.customer.phone}
              </span>
              <span className="figures">
                {text.requestOf(formatMga(request.amount), formatMga(request.order.total))}
              </span>
              <span className="text-ink-2">
                {CREDIT_REFUSAL_LABEL[request.refusal]} ;{' '}
                {text.owed(formatMga(request.outstanding))}
              </span>
              <span className="text-14 text-ink-2">
                {text.askedBy(request.requestedBy.fullName, formatTime(request.createdAt))}
              </span>
            </div>
            {editable && (
              <>
                <label className="flex w-32 flex-col gap-1">
                  <span className="text-14 text-ink-2">{text.days}</span>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={days[request.id] ?? DEFAULT_DAYS}
                    onChange={(event) =>
                      setDays((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                    className={`${FIELD} text-right figures`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => decide(request, true)}
                  disabled={busy === request.id}
                  className={buttonClass('primary', 'md')}
                >
                  {text.grant}
                </button>
                <button
                  type="button"
                  onClick={() => decide(request, false)}
                  disabled={busy === request.id}
                  className={buttonClass('secondary', 'md')}
                >
                  {text.reject}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
