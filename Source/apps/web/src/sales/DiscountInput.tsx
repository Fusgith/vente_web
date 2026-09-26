import { formatTyped } from '@vente-web/shared';

import { labels } from '../labels.js';
import { Icon } from '../ui/Icon.js';
import type { DiscountKind } from './discount-entry.js';
import type { DiscountTyping } from './useDiscountTyping.js';

const text = labels.sales.discount;

/** `selected`: the value shows selected, the first key replaces it; `active`: keys go there. */
export type FieldLook = 'selected' | 'active' | 'idle' | 'wrong';

const LOOK: Record<FieldLook, string> = {
  selected: 'border-indigo bg-indigo-soft',
  active: 'border-indigo bg-white shadow-[inset_0_0_0_1px_var(--color-indigo)]',
  idle: 'border-rule-strong bg-white',
  wrong: 'border-madder bg-madder-soft',
};

interface EntryFieldProps {
  label: string;
  value: string;
  /** Shown smaller after the value: « % », « MGA ». */
  sign?: string | undefined;
  look: FieldLook;
  /** Sends the keypad's keys to this field. */
  onActivate: () => void;
  disabled?: boolean | undefined;
}

/**
 * A value typed on the pad, its label above so that two fit side by side on the tablet's tool
 * pane; touching it sends the keys there (quantity or discount).
 */
export function EntryField({
  label,
  value,
  sign,
  look,
  onActivate,
  disabled = false,
}: EntryFieldProps) {
  // « 999 999,99 » still fits half the pane.
  const size = value.length > 7 ? 'text-24' : 'text-36';
  return (
    <button
      type="button"
      aria-pressed={look === 'selected' || look === 'active'}
      disabled={disabled}
      onClick={onActivate}
      className={`flex min-h-16 w-full min-w-0 flex-col justify-center rounded-control border px-3 py-1 text-left transition-colors duration-100 disabled:border-dashed disabled:text-ink-2 ${LOOK[look]}`}
    >
      <span className="block text-14 leading-4 text-ink-2">{label}</span>
      <span className="block truncate text-right font-semibold leading-10 figures">
        <span className={size}>{value}</span>
        {sign && <span className="text-18">{`\u00A0${sign}`}</span>}
      </span>
    </button>
  );
}

/** The discount being typed, with its sign. */
export function DiscountEntryField({
  typing,
  active,
  onActivate,
  disabled,
}: {
  typing: DiscountTyping;
  active: boolean;
  onActivate: () => void;
  disabled?: boolean | undefined;
}) {
  const look: FieldLook = typing.refused
    ? 'wrong'
    : active
      ? typing.untouched
        ? 'selected'
        : 'active'
      : 'idle';
  return (
    <EntryField
      label={text.label}
      value={formatTyped(typing.text)}
      sign={typing.kind === 'pct' ? text.pctSign : text.amountSign}
      look={look}
      onActivate={onActivate}
      disabled={disabled}
    />
  );
}

interface KindToggleProps {
  typing: DiscountTyping;
  /** Choosing a kind also sends the keys to the discount. */
  onActivate: () => void;
  disabled?: boolean | undefined;
}

/** % or MGA (RG-REM-06): another kind starts empty. */
export function KindToggle({ typing, onActivate, disabled = false }: KindToggleProps) {
  const choose = (kind: DiscountKind) => {
    typing.choose(kind);
    onActivate();
  };
  return (
    <div role="group" aria-label={text.kinds} className="grid grid-cols-2 gap-2">
      {(['pct', 'amount'] as const).map((kind) => {
        const on = kind === typing.kind;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            aria-label={kind === 'pct' ? text.inPct : text.inAmount}
            disabled={disabled}
            onClick={() => choose(kind)}
            className={`min-h-12 rounded-control border text-18 font-bold transition-colors duration-100 disabled:border-dashed disabled:bg-white disabled:text-ink-2 ${
              on
                ? 'border-indigo bg-indigo text-white active:bg-indigo-deep'
                : 'border-rule-strong bg-white text-ink active:bg-indigo-soft'
            }`}
          >
            {kind === 'pct' ? text.pctSign : text.amountSign}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Under the fields: the maximum, told before anything is typed (RG-REM-02), or what went wrong,
 * in its place so that the pad keeps its height.
 */
export function FieldMessage({ hint, alert }: { hint: string; alert: string | null }) {
  return alert ? (
    <p role="alert" className="flex items-start gap-1.5 text-14 font-semibold text-madder">
      <Icon name="alert" className="size-5 shrink-0" />
      {alert}
    </p>
  ) : (
    <p className="text-14 text-ink-2 figures">{hint}</p>
  );
}
