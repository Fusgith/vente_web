import { useId, useRef, useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.register;
/** RG-ANN-01: a reason is mandatory; three characters at least, as the API checks. */
const REASON_MIN = 3;

interface CancelOrderSheetProps {
  ticket: string;
  /** Named with the ticket (RG-TKT-03). */
  name: string;
  busy: boolean;
  onCancel: (reason: string) => void;
  onClose: () => void;
}

/** Cancelling before payment, with its reason (RG-ANN-01): the stock is freed, the ticket closed. */
export function CancelOrderSheet({ ticket, name, busy, onCancel, onClose }: CancelOrderSheetProps) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const ready = reason.trim().length >= REASON_MIN;

  return (
    <Sheet
      title={text.cancelTitle(ticket, name)}
      closeLabel={text.keepOrder}
      onClose={onClose}
      width="md"
      initialFocus={field}
      bodyClassName="flex flex-col gap-4"
    >
      <p className="text-ink-2">{text.cancelHint}</p>
      <label htmlFor={id} className="font-semibold">
        {text.cancelReason}
      </label>
      <textarea
        id={id}
        ref={field}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={300}
        rows={3}
        className="rounded-control border border-rule-strong bg-white p-3 text-18 text-ink"
      />
      <button
        type="button"
        onClick={() => onCancel(reason.trim())}
        disabled={busy || !ready}
        className={buttonClass('destructive', 'lg', 'w-full')}
      >
        {text.cancelOrder}
      </button>
    </Sheet>
  );
}
