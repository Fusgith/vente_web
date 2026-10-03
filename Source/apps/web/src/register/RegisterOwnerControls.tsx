import type { Order } from '@vente-web/shared';
import { useEffect, useRef, useState } from 'react';

import { requestPending, requestProducts } from '../api/discount-requests.js';
import { labels } from '../labels.js';
import { DiscountCodeSheet } from '../sales/DiscountCodeSheet.js';
import { DiscountRequestSheet } from '../sales/DiscountRequestSheet.js';
import type { RequestInput } from '../sales/useQuoteActions.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';

const text = labels.requests;
const MARK = 'inline-flex min-h-12 items-center gap-2 rounded-control border px-4 font-semibold';

interface RegisterOwnerControlsProps {
  order: Order;
  busy: boolean;
  /** The id of the request's mark, which says why the payment waits. */
  waitsId: string;
  /** The owner's code typed in its sheet: null once attached, else why it was refused. */
  onAttachCode: (code: string) => Promise<string | null>;
  /** The request from its sheet: null once sent, else why it was refused. */
  onAsk: (request: RequestInput) => Promise<string | null>;
  onWithdraw: () => void;
  onSetAside: () => void;
}

/**
 * Beyond the caps, at the register before payment: the owner's code typed (T-034c) or a discount
 * asked of the owner (T-033d, H51). Once the code is attached, its tag takes the buttons' place;
 * while a request waits, its mark does — the payment waits too (RG-REM-05) — with the withdrawal
 * agreed with the customer and the order set aside in the queue, at its place (H52, H54).
 */
export function RegisterOwnerControls({
  order,
  busy,
  waitsId,
  onAttachCode,
  onAsk,
  onWithdraw,
  onSetAside,
}: RegisterOwnerControlsProps) {
  const code = order.discountCode;
  const waiting = requestPending(order.discountRequest);
  const state = code ? `code:${code.code}` : waiting ? 'request' : null;
  // A sheet belongs to the state it was opened in: a code attached or a request made meanwhile
  // (the owner's answer, the tablet) closes it.
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

  if (code) {
    return (
      <span ref={mark} tabIndex={-1} className={`${MARK} border-indigo bg-indigo-soft figures`}>
        <Icon name="key" className="size-5 text-indigo" />
        {labels.sales.code.tag(code.code)}
      </span>
    );
  }
  if (waiting) {
    return (
      <>
        <span
          ref={mark}
          id={waitsId}
          tabIndex={-1}
          className="flex max-w-xl basis-full items-start gap-2 rounded-control border border-saffron bg-saffron-soft px-4 py-2"
        >
          <Icon name="info" className="size-5 shrink-0 translate-y-0.5" />
          <span className="flex flex-col">
            <span className="font-semibold">{text.atRegister}</span>
            <span className="text-14 text-ink-2">{text.withdrawHint}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy}
          className={buttonClass('secondary', 'md', 'shrink-0')}
        >
          <Icon name="erase" className="size-5" />
          {text.withdraw}
        </button>
        <button
          type="button"
          onClick={onSetAside}
          disabled={busy}
          className={buttonClass('secondary', 'md', 'shrink-0')}
        >
          {text.setAside}
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
        disabled={busy}
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
        disabled={busy}
        className={buttonClass('secondary', 'md', 'shrink-0')}
      >
        <Icon name="user" className="size-5" />
        {text.ask}
      </button>
      {open === 'code' && (
        <DiscountCodeSheet
          hint={labels.register.codeHint}
          onAttach={onAttachCode}
          onClose={close}
        />
      )}
      {open === 'request' && (
        <DiscountRequestSheet
          products={requestProducts(
            order.lines.map((line) => ({ id: line.productId, sku: line.sku, name: line.name })),
          )}
          onSend={onAsk}
          onClose={close}
        />
      )}
    </>
  );
}
