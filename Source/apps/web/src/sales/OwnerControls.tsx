import { useEffect, useRef, useState } from 'react';

import { requestPending, requestProducts } from '../api/discount-requests.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { DiscountCodeSheet } from './DiscountCodeSheet.js';
import { DiscountRequestSheet } from './DiscountRequestSheet.js';
import type { DraftState } from './draft.js';
import type { QuoteBusy, RequestInput } from './useQuoteActions.js';

const MARK = 'inline-flex min-h-12 items-center gap-2 rounded-control border px-4 font-semibold';

interface OwnerControlsProps {
  draft: DraftState;
  busy: QuoteBusy;
  /** The owner's code typed in its sheet: null once attached, else why it was refused. */
  onAttachCode: (code: string) => Promise<string | null>;
  /** The request from its sheet: null once sent, else why it was refused. */
  onAsk: (request: RequestInput) => Promise<string | null>;
  onWithdraw: () => void;
}

/**
 * Beyond the caps, under the quote: the owner's code typed (T-034b) or a discount asked of the
 * owner (T-033b). Once the code is attached, its tag takes the buttons' place; while a request
 * waits, its mark does, with the withdrawal agreed with the customer (H52, H54). Granted, the
 * request brings its code (H53).
 */
export function OwnerControls({
  draft,
  busy,
  onAttachCode,
  onAsk,
  onWithdraw,
}: OwnerControlsProps) {
  const waiting = requestPending(draft.request);
  const state = draft.code ? `code:${draft.code.code}` : waiting ? 'request' : null;
  // A sheet belongs to the state it was opened in: a code attached or a request made meanwhile
  // (the owner's answer, another device) closes it.
  const [opened, setOpened] = useState<{ sheet: 'code' | 'request'; on: string | null } | null>(
    null,
  );
  // Left from a state since gone, the opening is dropped: a sheet never comes back on its own.
  if (opened && opened.on !== state) setOpened(null);
  const open = opened?.on === state ? opened.sheet : null;
  const setOpen = (sheet: 'code' | 'request') => setOpened({ sheet, on: state });
  const close = () => setOpened(null);
  const mark = useRef<HTMLSpanElement>(null);
  const askButton = useRef<HTMLButtonElement>(null);
  const shownState = useRef(state);
  // The buttons give way to the code's tag or the request's mark, the mark to the buttons once
  // the request is closed: the focus, left on nothing, goes to what took the place, so a screen
  // reader says what changed.
  useEffect(() => {
    if (open !== null || state === shownState.current) return;
    shownState.current = state;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost) (state ? mark : askButton).current?.focus();
  }, [state, open]);

  if (draft.code) {
    return (
      <span ref={mark} tabIndex={-1} className={`${MARK} border-indigo bg-indigo-soft figures`}>
        <Icon name="key" className="size-5 text-indigo" />
        {draft.code.granted ? labels.sales.code.granted : labels.sales.code.tag(draft.code.code)}
      </span>
    );
  }
  if (waiting) {
    return (
      <>
        <span ref={mark} tabIndex={-1} className={`${MARK} border-saffron bg-saffron-soft`}>
          <Icon name="info" className="size-5" />
          {labels.requests.pending}
        </span>
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy !== null}
          className={buttonClass('secondary', 'md', 'shrink-0')}
        >
          <Icon name="erase" className="size-5" />
          {busy === 'request' ? labels.requests.withdrawing : labels.requests.withdraw}
        </button>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen('code')}
        disabled={busy !== null}
        className={buttonClass('secondary', 'md', 'shrink-0')}
      >
        <Icon name="key" className="size-5" />
        {labels.sales.code.open}
      </button>
      <button
        ref={askButton}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen('request')}
        disabled={busy !== null}
        className={buttonClass('secondary', 'md', 'shrink-0')}
      >
        <Icon name="user" className="size-5" />
        {labels.requests.ask}
      </button>
      {open === 'code' && <DiscountCodeSheet onAttach={onAttachCode} onClose={close} />}
      {open === 'request' && (
        <DiscountRequestSheet
          products={requestProducts(draft.lines.map((line) => line.product))}
          onSend={onAsk}
          onClose={close}
        />
      )}
    </>
  );
}
