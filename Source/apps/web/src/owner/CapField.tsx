import { formatQty, isCapRate } from '@vente-web/shared';
import { useState } from 'react';

import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';

const text = labels.caps;
const FIELD =
  'h-12 w-24 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-right text-18 text-ink figures';

/** « 2,5 » → « 2.5 »; empty stays empty. */
const typed = (value: string) => value.trim().replace(',', '.');
const shown = (pct: string | null) => (pct === null ? '' : formatQty(pct));

/**
 * One cap: read as « 5 % » (or « aucun »), or, for the owner, typed and saved on its own. Empty
 * clears a unit's, product's or category's own cap; the general cap is never empty (RG-REM-01).
 */
export function CapField({
  label,
  saveLabel,
  value,
  nullable,
  editable,
  onSave,
}: {
  /** The field's and the button's accessible names. */
  label: string;
  saveLabel: string;
  value: string | null;
  nullable: boolean;
  editable: boolean;
  onSave: (pct: string | null) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(shown(value));
  const [busy, setBusy] = useState(false);
  // A saved (or reloaded) cap replaces what was typed.
  const [saved, setSaved] = useState(value);
  if (saved !== value) {
    setSaved(value);
    setDraft(shown(value));
  }

  if (!editable) {
    return (
      <span className="figures">{value === null ? text.none : text.pct(formatQty(value))}</span>
    );
  }
  const entry = typed(draft);
  const valid = entry === '' ? nullable : isCapRate(entry);
  const changed = draft !== shown(value);
  const save = () => {
    setBusy(true);
    void onSave(entry === '' ? null : entry).finally(() => setBusy(false));
  };
  return (
    <span className="flex items-center gap-2">
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={!valid}
        title={valid ? undefined : text.invalid}
        placeholder={nullable ? text.none : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && valid && changed && !busy) save();
        }}
        className={FIELD}
      />
      <button
        type="button"
        onClick={save}
        disabled={busy || !valid || !changed}
        aria-label={saveLabel}
        className={buttonClass('secondary', 'md')}
      >
        {busy ? text.saving : text.save}
      </button>
    </span>
  );
}
