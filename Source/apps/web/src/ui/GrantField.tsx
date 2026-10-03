import { labels } from '../labels.js';
import { isGrant, type Grant } from './grant.js';

const text = labels.codes;
const VALUE =
  'h-12 w-32 min-w-0 rounded-control border border-rule-strong bg-white px-3 text-right text-18 text-ink figures';

/**
 * A rate or an amount beyond the caps, typed for the owner's code (T-034), a request (T-033b) or
 * the owner's answer to it (T-033c). `label` names the field for a screen reader.
 */
export function GrantField({
  what,
  label = text.grantOf,
  grant,
  onChange,
}: {
  what: string;
  label?: (what: string) => string;
  grant: Grant;
  onChange: (grant: Grant) => void;
}) {
  const valid = grant.value === '' || isGrant(grant);
  return (
    <span className="flex items-center gap-2">
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={label(what)}
        aria-invalid={!valid}
        title={valid ? undefined : text.invalid}
        value={grant.value}
        onChange={(event) => onChange({ ...grant, value: event.target.value })}
        className={VALUE}
      />
      <select
        aria-label={text.kindOf(what)}
        value={grant.kind}
        onChange={(event) => onChange({ ...grant, kind: event.target.value as Grant['kind'] })}
        className="h-12 rounded-control border border-rule-strong bg-white px-2 text-18"
      >
        <option value="pct">{text.kinds.pct}</option>
        <option value="amount">{text.kinds.amount}</option>
      </select>
    </span>
  );
}
