import { formatAmount, formatTime, sumAmounts, type SessionSummary } from '@vente-web/shared';
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { paymentsApi } from '../api/payments.js';
import { labels } from '../labels.js';
import { buttonClass, sheetClass, tagClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { AmountHead } from '../ui/DocumentTable.js';

const text = labels.closing;

function State({ session }: { session: SessionSummary }) {
  if (session.forgotten) {
    return <span className={`${tagClass} border-madder text-madder`}>{text.forgotten}</span>;
  }
  if (session.closedAt) return <span>{text.closedAt(formatTime(session.closedAt))}</span>;
  return <span className={`${tagClass} border-indigo text-indigo`}>{text.open}</span>;
}

/**
 * The shop day's register sessions for the manager and the owner (RG-CAI-04/05, ⚠️ H35): who
 * holds which register, what it took, the variance once closed, the report; a session left open
 * from an earlier day stands out as forgotten.
 */
export function RegisterSessionsPanel() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const load = useCallback(() => {
    paymentsApi.sessions().then(
      (list) => {
        setSessions(list);
        setFailure(null);
      },
      (error: unknown) => setFailure(errorMessage(error)),
    );
  }, []);
  useEffect(load, [load]);

  return (
    <section
      aria-labelledby="day-sessions"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden`}
    >
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <h2 id="day-sessions" className="type-title">
          {text.daySessions}
        </h2>
        <button type="button" onClick={load} className={buttonClass('secondary', 'md')}>
          {text.refresh}
        </button>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {sessions?.length === 0 && <p className="px-4 pb-4 text-ink-2">{text.noSession}</p>}
      {sessions && sessions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className={`${HEAD} w-28`}>{text.register}</th>
                <th className={HEAD}>{text.cashier}</th>
                <th className={`${HEAD} w-24`}>{text.openedAt}</th>
                <th className={`${HEAD} w-44`}>{text.state}</th>
                <AmountHead label={text.taken} width="w-32" />
                <AmountHead label={text.variance} width="w-28" />
                <th className={`${HEAD} w-28`}>
                  <span className="sr-only">{text.reportShort}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const row = `${CELL} h-14 border-b border-rule py-1`;
                const taken = sumAmounts(session.byMethod.map((method) => method.total));
                const off = session.variance !== null && session.variance !== '0.00';
                return (
                  <tr key={session.id}>
                    <td className={`${row} font-semibold`}>{session.station.name}</td>
                    <td className={`${row} truncate`}>{session.cashier.fullName}</td>
                    <td className={`${row} figures`}>{formatTime(session.openedAt)}</td>
                    <td className={`${row} leading-5`}>
                      <State session={session} />
                    </td>
                    <td className={`${row} text-right font-semibold figures`}>
                      {formatAmount(taken)}
                    </td>
                    <td
                      className={`${row} text-right figures ${off ? 'font-bold text-madder' : ''}`}
                    >
                      {session.variance === null ? '' : formatAmount(session.variance)}
                    </td>
                    <td className={row}>
                      <a
                        href={paymentsApi.reportUrl(session.id)}
                        target="_blank"
                        rel="noopener"
                        aria-label={text.reportOf(session.station.name)}
                        className={buttonClass('secondary', 'md', 'w-full px-2')}
                      >
                        {text.reportShort}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
