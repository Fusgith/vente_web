import { DISCOUNT_REQUEST_NOTE_MAX } from '@vente-web/shared';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { discountRequestsApi, type RequestProduct } from '../api/discount-requests.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, tagClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { entryOf, isGrant, type Grant } from '../ui/grant.js';
import { GrantField } from '../ui/GrantField.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';
import type { RequestInput } from './useQuoteActions.js';

const text = labels.requests;

const TOTAL = 'total';
const FIELD = 'rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';

interface DiscountRequestSheetProps {
  products: readonly RequestProduct[];
  /** Null once sent (the band says so); else why it was refused, shown under the form. */
  onSend: (request: RequestInput) => Promise<string | null>;
  onClose: () => void;
}

/**
 * A discount beyond the caps asked of the owner (RG-REM-03, H51): a rate or an amount on products
 * of the quote and/or on its total — what is left empty is not asked —, a reason from the list
 * (`discount_reasons`) and an optional note. On the tablet (T-033b) and at the register (T-033d).
 */
export function DiscountRequestSheet({ products, onSend, onClose }: DiscountRequestSheetProps) {
  const id = useId();
  const [grants, setGrants] = useState<Record<string, Grant>>({});
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  /** The reasons unread (the Wi-Fi): said by the list itself until read again. */
  const [unread, setUnread] = useState<string | null>(null);
  const { sayError } = useStatusLine();
  const shown = useRef(false);

  const loadReasons = useCallback(() => {
    discountRequestsApi.reasons().then(
      (list) => {
        if (shown.current) setReasons(list);
      },
      (error: unknown) => {
        if (shown.current) setUnread(errorMessage(error));
      },
    );
  }, []);
  useEffect(() => {
    shown.current = true;
    loadReasons();
    return () => {
      shown.current = false;
    };
  }, [loadReasons]);

  const grantOf = (key: string): Grant => grants[key] ?? { kind: 'pct', value: '' };
  const change = (key: string, grant: Grant) => {
    setGrants((current) => ({ ...current, [key]: grant }));
    setRefused(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const asked = [...products.map((product) => product.id), TOTAL]
      .map((key) => [key, grantOf(key)] as const)
      .filter(([, grant]) => grant.value.trim() !== '');
    const invalid =
      asked.length === 0
        ? text.nothingAsked
        : asked.some(([, grant]) => !isGrant(grant))
          ? text.invalid
          : reason === ''
            ? text.reasonFirst
            : null;
    if (invalid) return setRefused(invalid);
    setBusy(true);
    setRefused(null);
    const trimmed = note.trim();
    const refusal = await onSend({
      items: asked.map(([key, grant]) => ({
        productId: key === TOTAL ? null : key,
        discount: entryOf(grant),
      })),
      reason,
      note: trimmed === '' ? null : trimmed,
    });
    if (refusal === null) return onClose();
    if (!shown.current) return sayError(refusal);
    setBusy(false);
    setRefused(refusal);
  };

  return (
    <Sheet
      title={text.title}
      closeLabel={text.close}
      onClose={onClose}
      width="lg"
      bodyClassName="flex flex-col gap-4"
    >
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-col gap-4"
        aria-describedby={`${id}-help`}
      >
        <p id={`${id}-help`} className="text-ink-2">
          {text.help}
        </p>
        <table className="w-full border-separate border-spacing-0 text-left text-16">
          <thead>
            <tr>
              <th className={HEAD}>{text.item}</th>
              <th className={HEAD + ' w-56'}>{text.wanted}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td className={`${CELL} border-b border-rule py-2`}>
                  <span className={tagClass}>{product.sku}</span>
                  <span className="line-clamp-2 leading-5">{product.name}</span>
                </td>
                <td className={`${CELL} border-b border-rule py-2`}>
                  <GrantField
                    what={product.name}
                    label={text.wantedOf}
                    grant={grantOf(product.id)}
                    onChange={(grant) => change(product.id, grant)}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td className={`${CELL} py-2 font-semibold`}>{text.total}</td>
              <td className={`${CELL} py-2`}>
                <GrantField
                  what={text.totalWhat}
                  label={text.wantedOf}
                  grant={grantOf(TOTAL)}
                  onChange={(grant) => change(TOTAL, grant)}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <label className="flex flex-col gap-1.5 font-semibold">
            {text.reason}
            <select
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setRefused(null);
              }}
              disabled={reasons === null}
              aria-describedby={unread ? `${id}-reasons` : undefined}
              className={`${FIELD} h-12`}
            >
              <option value="">{text.reasonNone}</option>
              {reasons?.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-note`} className="font-semibold">
              {text.note}
            </label>
            <textarea
              id={`${id}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={DISCOUNT_REQUEST_NOTE_MAX}
              rows={2}
              aria-describedby={`${id}-note-hint`}
              className={`${FIELD} py-2`}
            />
            <span id={`${id}-note-hint`} className="text-14 text-ink-2">
              {text.noteHint(DISCOUNT_REQUEST_NOTE_MAX)}
            </span>
          </div>
        </div>
        {unread && (
          <div className="flex flex-wrap items-center gap-3">
            <p id={`${id}-reasons`} role="alert" className="font-semibold text-madder">
              {unread}
            </p>
            <button
              type="button"
              onClick={() => {
                setUnread(null);
                loadReasons();
              }}
              className={buttonClass('secondary', 'md', 'shrink-0')}
            >
              {labels.retry}
            </button>
          </div>
        )}
        {refused && (
          <p role="alert" className="flex items-start gap-1.5 font-semibold text-madder">
            <Icon name="alert" className="size-5 shrink-0 translate-y-px" />
            {refused}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonClass('primary', 'lg')}>
          <Icon name="user" className="size-5" />
          {busy ? text.sending : text.send}
        </button>
      </form>
    </Sheet>
  );
}
