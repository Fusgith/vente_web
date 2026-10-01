import { normalizeDiscountCode } from '@vente-web/shared';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Sheet } from '../ui/Sheet.js';

const text = labels.sales.code;

interface DiscountCodeSheetProps {
  /** Null once attached; else why the code was refused. */
  onAttach: (code: string) => Promise<string | null>;
  onClose: () => void;
}

/**
 * The owner's code typed on the quote (RG-REM-04, H42): the API checks it and uses it at once,
 * and the lines and the total it covers take what it grants. Case, spaces and hyphens do not
 * count (H41); a refusal stays under the field, to correct the code where it was typed — or goes
 * to the band if the sheet was closed meanwhile.
 */
export function DiscountCodeSheet({ onAttach, onClose }: DiscountCodeSheetProps) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const { sayError } = useStatusLine();
  const shown = useRef(false);
  const empty = normalizeDiscountCode(typed) === '';

  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (empty || busy) return;
    setBusy(true);
    setRefused(null);
    const refusal = await onAttach(typed.trim());
    if (refusal === null) return onClose();
    if (!shown.current) return sayError(refusal);
    setBusy(false);
    setRefused(refusal);
    field.current?.select();
  };

  return (
    <Sheet
      title={text.title}
      closeLabel={text.close}
      onClose={onClose}
      width="md"
      initialFocus={field}
      bodyClassName="flex flex-col gap-4"
    >
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-3">
        <label htmlFor={id} className="font-semibold">
          {text.field}
        </label>
        <input
          id={id}
          ref={field}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setRefused(null);
          }}
          aria-describedby={`${id}-hint`}
          aria-invalid={refused ? true : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={16}
          className={`h-16 w-full rounded-control border px-4 text-24 font-semibold tracking-[0.12em] text-ink uppercase figures ${
            refused ? 'border-madder bg-madder-soft' : 'border-rule-strong bg-white'
          }`}
        />
        {refused ? (
          <p
            id={`${id}-hint`}
            role="alert"
            className="flex items-start gap-1.5 font-semibold text-madder"
          >
            <Icon name="alert" className="size-5 shrink-0 translate-y-px" />
            {refused}
          </p>
        ) : (
          <p id={`${id}-hint`} className="text-14 text-ink-2">
            {text.hint}
          </p>
        )}
        <button
          type="submit"
          disabled={empty || busy}
          className={buttonClass('primary', 'lg', 'mt-2')}
        >
          <Icon name="check" className="size-5" />
          {busy ? text.applying : text.apply}
        </button>
      </form>
    </Sheet>
  );
}
