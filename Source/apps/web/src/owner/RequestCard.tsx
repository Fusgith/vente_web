import {
  formatAmount,
  formatQty,
  formatTime,
  ticketLabel,
  type DiscountRequest,
  type DiscountRequestGrant,
} from '@vente-web/shared';
import { useId, useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { AmountHead } from '../ui/DocumentTable.js';
import { GrantField } from '../ui/GrantField.js';
import { Icon } from '../ui/Icon.js';
import {
  ANSWERS,
  answerOf,
  askedAnswers,
  entryText,
  grantItems,
  itemName,
  type Answer,
} from './request-answers.js';

const text = labels.requests.board;
const ROW = `${CELL} border-b border-rule py-2`;
/**
 * Below `sm` (the owner's phone, H55), a table and its row groups are blocks and each row a small
 * grid: the name on its line, the figures under it — read without scrolling sideways.
 */
const STACK = 'max-sm:block';
const STACK_ROW = 'max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto]';
/** A grid ignores `align-bottom`: the headers lose their fixed height and sit on one baseline. */
const STACK_HEAD = `${STACK_ROW} max-sm:items-end max-sm:*:h-auto`;
const CHOICE =
  'focus-within-ring inline-flex min-h-12 cursor-pointer items-center rounded-control border border-rule-strong bg-white px-3 font-semibold has-checked:border-indigo has-checked:bg-indigo-soft';

export type Decision = 'grant' | 'reject';

interface RequestCardProps {
  request: DiscountRequest;
  /** Null: read only (the manager, H54). */
  onDecide: ((decision: Decision, items?: DiscountRequestGrant['items']) => Promise<void>) | null;
  /** The decision under way on this request, its buttons waiting. */
  busy: Decision | null;
}

/**
 * One request waiting for the owner (T-033c, RG-REM-03, H53): who asks, for whom, on which order,
 * why; the lines of the order; then each element asked — granted as asked, at another value, or
 * not — and the decision in one gesture.
 */
export function RequestCard({ request, onDecide, busy }: RequestCardProps) {
  const id = useId();
  const { order } = request;
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => askedAnswers(request.items));
  const [refused, setRefused] = useState<string | null>(null);
  const choose = (itemId: string, answer: Answer) => {
    setAnswers((current) => ({ ...current, [itemId]: answer }));
    setRefused(null);
  };
  const grant = () => {
    const items = grantItems(request.items, answers);
    if (typeof items === 'string') return setRefused(items);
    void onDecide?.('grant', items);
  };

  return (
    <article
      aria-labelledby={`${id}-title`}
      className="mx-4 flex flex-col gap-3 rounded-control border border-saffron bg-white px-4 py-3"
    >
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h4 id={`${id}-title`} className="text-18 font-bold">
          {text.of(order.customer.name)}
        </h4>
        <span className="text-ink-2">
          {text.by(request.requestedBy.fullName, formatTime(request.createdAt))}
        </span>
        <span className="figures text-ink-2">{text.order(order.number)}</span>
        {order.ticket && <span className={`${tagClass} figures`}>{ticketLabel(order.ticket)}</span>}
      </header>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="font-semibold">{text.reason}</dt>
        <dd>{request.reason}</dd>
        {request.note && (
          <>
            <dt className="font-semibold">{text.note}</dt>
            <dd className="whitespace-pre-line">{request.note}</dd>
          </>
        )}
      </dl>
      <div className="overflow-x-auto">
        <table
          aria-label={text.lines}
          className={`w-full table-fixed border-separate border-spacing-0 text-left sm:min-w-[32rem] ${STACK}`}
        >
          <thead className={STACK}>
            <tr className={STACK_HEAD}>
              <th className={HEAD}>{text.head.designation}</th>
              <th className={`${HEAD} w-28 text-right max-sm:hidden`}>{text.head.quantity}</th>
              <AmountHead label={text.head.net} width="w-36" />
            </tr>
          </thead>
          <tbody className={STACK}>
            {order.lines.map((line) => (
              <tr key={line.position} className={STACK_ROW}>
                <td className={`${ROW} max-sm:col-span-2 max-sm:border-b-0 max-sm:pb-0`}>
                  <span className={tagClass}>{line.sku}</span> {line.name}
                </td>
                <td
                  className={`${ROW} figures text-right max-sm:pl-4 max-sm:text-left max-sm:text-ink-2`}
                >
                  {formatQty(line.qty)} {line.unitLabel}
                </td>
                <td className={`${ROW} figures text-right`}>{formatAmount(line.net)}</td>
              </tr>
            ))}
            <tr className={STACK_ROW}>
              <td colSpan={2} className={`${CELL} py-2 text-right font-semibold max-sm:text-left`}>
                {text.total}
              </td>
              <td className={`${CELL} figures py-2 text-right font-bold`}>
                {formatAmount(order.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table
          aria-label={labels.requests.wanted}
          className={`w-full border-separate border-spacing-0 text-left sm:min-w-[40rem] ${STACK}`}
        >
          <thead className={STACK}>
            <tr className={STACK_HEAD}>
              <th className={HEAD}>{text.head.item}</th>
              <th className={`${HEAD} w-36 text-right max-sm:pr-4`}>{text.head.asked}</th>
              {onDecide && <th className={`${HEAD} max-sm:hidden`}>{text.head.answer}</th>}
            </tr>
          </thead>
          <tbody className={STACK}>
            {request.items.map((item) => {
              const answer = answers[item.id] ?? { choice: 'asked' };
              const name = itemName(item);
              return (
                <tr key={item.id} className={STACK_ROW}>
                  <td className={`${ROW} max-sm:border-b-0`}>{name}</td>
                  <td
                    className={`${ROW} figures text-right font-semibold max-sm:border-b-0 max-sm:pr-4`}
                  >
                    {entryText(item.requested)}
                  </td>
                  {onDecide && (
                    <td className={`${ROW} max-sm:col-span-2 max-sm:pl-4`}>
                      <fieldset className="flex flex-wrap items-center gap-2">
                        <legend className="sr-only">{text.answerOf(name)}</legend>
                        {ANSWERS.map((choice) => (
                          <label key={choice} className={CHOICE}>
                            <input
                              type="radio"
                              name={`${id}-${item.id}`}
                              checked={answer.choice === choice}
                              onChange={() => choose(item.id, answerOf(item, choice))}
                              className="sr-only"
                            />
                            {text.answers[choice]}
                          </label>
                        ))}
                        {answer.choice === 'other' && (
                          <GrantField
                            what={name}
                            label={text.grantOf}
                            grant={answer.grant}
                            onChange={(grant) => choose(item.id, { choice: 'other', grant })}
                          />
                        )}
                      </fieldset>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {refused && (
        <p role="alert" className="flex items-start gap-1.5 font-semibold text-madder">
          <Icon name="alert" className="size-5 shrink-0 translate-y-px" />
          {refused}
        </p>
      )}
      {onDecide && (
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => void onDecide('reject')}
            disabled={busy !== null}
            className={buttonClass('destructive', 'md')}
          >
            {busy === 'reject' ? text.rejecting : text.reject}
          </button>
          <button
            type="button"
            onClick={grant}
            disabled={busy !== null}
            className={buttonClass('primary', 'md')}
          >
            <Icon name="check" className="size-5" />
            {busy === 'grant' ? text.granting : text.grant}
          </button>
        </div>
      )}
    </article>
  );
}
