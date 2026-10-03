import { formatMga, formatQty, formatTime, type DiscountCode } from '@vente-web/shared';
import { useCallback, useEffect, useState } from 'react';

import { discountCodesApi } from '../api/discount-codes.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { IssueCodeForm } from './IssueCodeForm.js';

const text = labels.codes;
const ROW = `${CELL} h-14 border-b border-rule py-1`;

/** « SAV-001 : 12 % ; Total : 5 000,00 MGA » — a mixed column, so each amount carries its MGA. */
const grantsOf = (code: DiscountCode) =>
  code.items
    .map(
      ({ product, discount }) =>
        `${product?.sku ?? text.onTotal} : ${
          discount.kind === 'pct' ? `${formatQty(discount.value)} %` : formatMga(discount.value)
        }`,
    )
    .join(' ; ');

/**
 * The owner's discount codes (T-034, RG-REM-04, H41): a new one for a customer, the codes of the
 * day with their state, and the revocation of an active one. The code shown once issued is the one
 * to give, by phone or by word, to the sales clerk or the cashier.
 */
export function DiscountCodesPanel() {
  const { say } = useStatusLine();
  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [latest, setLatest] = useState<DiscountCode | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(() => {
    discountCodesApi.list().then(setCodes, (error: unknown) => setFailure(errorMessage(error)));
  }, []);
  useEffect(load, [load]);
  // A request granted gives its code (H53), from this screen or another: the day's list follows.
  useRealtimeEvent('discount.request_decided', ({ status }) => {
    if (status === 'GRANTED') load();
  });
  useRealtimeConnect(load);

  const issued = (code: DiscountCode) => {
    setLatest(code);
    setCodes((list) => [code, ...(list ?? [])]);
    setFailure(null);
    say(text.issued(code.code, code.customer?.name ?? ''), 'check');
  };
  const revoke = (code: DiscountCode) =>
    discountCodesApi.revoke(code.id).then(
      (revoked) => {
        setCodes((list) => list?.map((kept) => (kept.id === revoked.id ? revoked : kept)) ?? null);
        if (latest?.id === revoked.id) setLatest(null);
        setFailure(null);
        say(text.revoked(revoked.code), 'check');
      },
      (error: unknown) => setFailure(errorMessage(error)),
    );

  return (
    <section
      aria-labelledby="discount-codes"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="discount-codes" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{text.help}</p>
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      <IssueCodeForm onIssued={issued} onFailure={setFailure} />
      {latest && (
        <div className="mx-4 flex flex-col gap-1 rounded-control border border-indigo bg-indigo-soft px-4 py-3">
          <span className="font-semibold">{text.toGive}</span>
          <output aria-label={text.toGive} className="type-title figures tracking-wider">
            {latest.code}
          </output>
          <span className="text-ink-2">{latest.customer?.name}</span>
        </div>
      )}
      <h3 className="px-4 pt-2 font-semibold">{text.list}</h3>
      {codes?.length === 0 && <p className="px-4 text-ink-2">{text.empty}</p>}
      {codes && codes.length > 0 && (
        <div className="overflow-x-auto">
          <table
            aria-label={text.list}
            className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-left"
          >
            <thead>
              <tr>
                <th className={`${HEAD} w-36`}>{text.head.code}</th>
                <th className={HEAD}>{text.head.customer}</th>
                <th className={HEAD}>{text.head.grants}</th>
                <th className={`${HEAD} w-24`}>{text.head.expires}</th>
                <th className={`${HEAD} w-24`}>{text.head.status}</th>
                <th className={`${HEAD} w-32`} />
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id}>
                  <td className={`${ROW} figures font-semibold`}>{code.code}</td>
                  <td className={ROW}>{code.customer?.name}</td>
                  <td className={ROW}>{grantsOf(code)}</td>
                  <td className={`${ROW} figures`}>{formatTime(code.expiresAt)}</td>
                  <td className={ROW}>{text.status[code.status]}</td>
                  <td className={ROW}>
                    {code.status === 'ACTIVE' && (
                      <button
                        type="button"
                        aria-label={text.revokeOf(code.code)}
                        onClick={() => void revoke(code)}
                        className={buttonClass('destructive', 'md')}
                      >
                        {text.revoke}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
