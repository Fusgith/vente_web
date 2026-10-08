import { formatTime, type DiscountRequest, type DiscountRequestGrant } from '@vente-web/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { discountRequestsApi } from '../api/discount-requests.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useRealtimeConnect, useRealtimeEvent } from '../realtime/context.js';
import { useStatusLine } from '../shell/status-line.js';
import { sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { PushSwitch } from './PushSwitch.js';
import { entryText, itemName } from './request-answers.js';
import { RequestCard, type Decision } from './RequestCard.js';

const text = labels.requests.board;
const ROW = `${CELL} h-14 border-b border-rule py-1`;

/**
 * « SAV-001 Savon : 12 % ; Total de la commande : Rien » — granted, what the owner gave each
 * element (nothing included); otherwise what was asked.
 */
const itemsOf = (request: DiscountRequest) =>
  request.items
    .map((item) => {
      const given = request.status === 'GRANTED' ? item.granted : item.requested;
      return `${itemName(item)} : ${given ? entryText(given) : text.answers.none}`;
    })
    .join(' ; ');

/** « Accordée par Naivo » — who closed it, when someone did. */
function statusOf(request: DiscountRequest): string {
  const by = request.decidedBy ?? request.withdrawnBy;
  const status = text.status[request.status];
  return by ? `${status} ${text.closedBy(by.fullName)}` : status;
}

/**
 * The exceptional discount requests (T-033c, RG-REM-03, RG-DSH-05, H53, H54): those waiting, each
 * decided element by element — the grant is applied to the order at once, its code never shown
 * (H64): the order it went on is named —, then those closed this shop day. Read only for the manager. A card
 * follows its order: changed at the register or on the tablet, it is read again.
 */
export function DiscountRequestsPanel({ editable }: { editable: boolean }) {
  const { say } = useStatusLine();
  const [pending, setPending] = useState<DiscountRequest[] | null>(null);
  const [recent, setRecent] = useState<DiscountRequest[]>([]);
  const [latest, setLatest] = useState<DiscountRequest | null>(null);
  /** The list unread (the network), then a decision refused: each said until it is resolved. */
  const [unread, setUnread] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** The decisions on their way, by request: each card waits for its own. */
  const [busy, setBusy] = useState<Record<string, Decision>>({});
  const known = useRef<Set<string> | null>(null);
  const orders = useRef<Set<string>>(new Set());
  /** The card decided from here, and where the focus goes once it is gone. */
  const leaving = useRef<{ id: string; to: 'applied' | 'list' } | null>(null);
  const applied = useRef<HTMLOutputElement>(null);
  const waitingTitle = useRef<HTMLHeadingElement>(null);

  /** Read again; a request not seen before is told in the band (the owner may be elsewhere). */
  const load = useCallback(() => {
    discountRequestsApi.list().then(
      (list) => {
        const seen = known.current;
        known.current = new Set(list.pending.map((request) => request.id));
        setPending(list.pending);
        setRecent(list.recent);
        setUnread(null);
        const arrived = seen && list.pending.filter((request) => !seen.has(request.id));
        // The owner decides, the manager follows: both are told at once (H51).
        if (arrived?.length) say(text.arrived(arrived.at(-1)!.order.customer.name));
      },
      (error: unknown) => setUnread(errorMessage(error)),
    );
  }, [say]);

  useEffect(load, [load]);
  useRealtimeEvent('discount.request_created', load);
  useRealtimeEvent('discount.request_decided', load);
  useRealtimeConnect(load);
  // The order of a card changed (lines lowered at the register, cancelled, paid…): read again.
  // Kept within the commit that shows the cards: an event arriving before React's next slice
  // (a loaded tablet) still finds their orders.
  useLayoutEffect(() => {
    orders.current = new Set(pending?.map((request) => request.order.id));
  }, [pending]);
  const follow = ({ orderId }: { orderId: string }) => {
    if (orders.current.has(orderId)) load();
  };
  useRealtimeEvent('queue.changed', follow);
  useRealtimeEvent('order.status_changed', follow);

  // The card decided gone, its focused button with it: the focus goes to the order granted, or
  // to the list, so a screen reader says what came of it.
  useEffect(() => {
    const gone = leaving.current;
    if (!gone || pending?.some((request) => request.id === gone.id)) return;
    leaving.current = null;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost) (gone.to === 'applied' ? applied : waitingTitle).current?.focus();
  }, [pending]);

  const decide = async (
    request: DiscountRequest,
    decision: Decision,
    items?: DiscountRequestGrant['items'],
  ) => {
    setBusy((current) => ({ ...current, [request.id]: decision }));
    setFailure(null);
    leaving.current = { id: request.id, to: 'list' };
    try {
      const closed =
        decision === 'grant' && items
          ? await discountRequestsApi.grant(request.id, items)
          : await discountRequestsApi.reject(request.id);
      setPending((list) => list?.filter((kept) => kept.id !== closed.id) ?? null);
      setRecent((list) => [closed, ...list.filter((kept) => kept.id !== closed.id)]);
      setFailure(null);
      const name = closed.order.customer.name;
      if (closed.status === 'GRANTED') {
        leaving.current = { id: request.id, to: 'applied' };
        setLatest(closed);
        say(text.granted(name, closed.order.number), 'check');
      } else say(text.rejected(name), 'check');
    } catch (error) {
      // Withdrawn or expired meanwhile: the list read again shows how it ended.
      setFailure(errorMessage(error));
      load();
    } finally {
      setBusy(({ [request.id]: _done, ...others }) => others);
    }
  };

  return (
    <section
      aria-labelledby="discount-requests"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-col gap-1 px-4 pt-3">
        <h2 id="discount-requests" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{editable ? text.help : text.readOnly}</p>
        {editable && <PushSwitch />}
      </header>
      {(unread ?? failure) && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {unread ?? failure}
        </p>
      )}
      {latest && (
        <div className="mx-4 flex flex-col gap-1 rounded-control border border-indigo bg-indigo-soft px-4 py-3">
          <output ref={applied} tabIndex={-1} className="font-semibold">
            {text.appliedTo(latest.order.number)}
          </output>
          <span className="text-ink-2">{latest.order.customer.name}</span>
        </div>
      )}
      <h3 ref={waitingTitle} tabIndex={-1} className="px-4 pt-2 font-semibold">
        {text.pending}
      </h3>
      {pending?.length === 0 && <p className="px-4 text-ink-2">{text.pendingEmpty}</p>}
      {pending?.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          busy={busy[request.id] ?? null}
          onDecide={editable ? (decision, items) => decide(request, decision, items) : null}
        />
      ))}
      <h3 className="px-4 pt-2 font-semibold">{text.recent}</h3>
      {pending && recent.length === 0 && <p className="px-4 text-ink-2">{text.recentEmpty}</p>}
      {recent.length > 0 && (
        <div className="overflow-x-auto">
          <table
            aria-label={text.recent}
            className="w-full min-w-[44rem] table-fixed border-separate border-spacing-0 text-left"
          >
            <thead>
              <tr>
                <th className={`${HEAD} w-20`}>{text.head.time}</th>
                <th className={`${HEAD} w-40`}>{text.head.customer}</th>
                <th className={HEAD}>{text.head.items}</th>
                <th className={`${HEAD} w-44`}>{text.head.status}</th>
                <th className={`${HEAD} w-40`}>{text.head.order}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((request) => (
                <tr key={request.id}>
                  <td className={`${ROW} figures`}>
                    {formatTime(request.closedAt ?? request.createdAt)}
                  </td>
                  <td className={ROW}>{request.order.customer.name}</td>
                  <td className={ROW}>{itemsOf(request)}</td>
                  <td className={ROW}>{statusOf(request)}</td>
                  <td className={`${ROW} figures`}>{request.order.number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
