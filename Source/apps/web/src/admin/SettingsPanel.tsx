import type { SettingKey, Settings } from '@vente-web/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { settingsApi } from '../api/settings.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';

const text = labels.settings;
const FIELD = 'min-w-0 rounded-control border border-rule-strong bg-white px-3 text-18 text-ink';
const LEGAL = ['name', 'address', 'phone', 'nif', 'stat', 'rcs', 'footer'] as const;

type Kind = 'text' | 'number' | 'check' | 'list' | 'rounding';
/** The form as typed: a list one item per line, the shop's identity field by field. */
type Draft = Record<string, string | boolean>;

const GROUPS: [keyof typeof text.groups, [SettingKey, Kind][]][] = [
  ['store', [['store.legal', 'text']]],
  [
    'invoice',
    [
      ['vat_enabled', 'check'],
      ['vat_rate', 'number'],
      ['vat_notice', 'text'],
      ['cash_rounding', 'rounding'],
      ['invoice_prefix', 'text'],
      ['credit_note_prefix', 'text'],
      ['quote_prefix', 'text'],
    ],
  ],
  [
    'delays',
    [
      ['day_end_time', 'text'],
      ['quote_validity_days', 'number'],
      ['promo_code_days', 'number'],
      ['discount_code.length', 'number'],
    ],
  ],
  [
    'lists',
    [
      ['customer_categories', 'list'],
      ['discount_reasons', 'list'],
      ['adjustment_reasons', 'list'],
    ],
  ],
  [
    'display',
    [
      ['display.enabled', 'check'],
      ['display.sound', 'check'],
      ['display.last_calls', 'number'],
    ],
  ],
  [
    'kiosk',
    [
      ['kiosk.idle_seconds', 'number'],
      ['kiosk.max_baskets_per_hour', 'number'],
    ],
  ],
  [
    'lock',
    [
      ['session.lock_minutes.tablet', 'number'],
      ['session.lock_minutes.register', 'number'],
    ],
  ],
];
const FIELDS = GROUPS.flatMap(([, fields]) => fields);

const namesOf = (key: SettingKey) =>
  key === 'store.legal' ? LEGAL.map((part) => `${key}.${part}`) : [key];

function toDraft(values: Settings['values']): Draft {
  const draft: Draft = {};
  for (const [key, kind] of FIELDS) {
    const value = values[key];
    if (key === 'store.legal') {
      const legal = (value ?? {}) as Record<string, unknown>;
      for (const part of LEGAL) draft[`${key}.${part}`] = String(legal[part] ?? '');
    } else if (kind === 'check') draft[key] = value === true;
    else if (kind === 'list') draft[key] = Array.isArray(value) ? value.join('\n') : '';
    else
      draft[key] = value === null || value === undefined || value === 'none' ? '' : String(value);
  }
  return draft;
}

function fromDraft(draft: Draft, key: SettingKey, kind: Kind): unknown {
  if (key === 'store.legal')
    return Object.fromEntries(LEGAL.map((part) => [part, draft[`${key}.${part}`]]));
  if (kind === 'check') return draft[key];
  const typed = String(draft[key]).trim();
  if (kind === 'list') return typed.split('\n').flatMap((item) => item.trim() || []);
  if (kind === 'number') return Number(typed.replace(',', '.'));
  if (kind === 'rounding') return typed === '' ? 'none' : Number(typed);
  return typed;
}

/** The admin's settings (CDC métier §13, T-013): each changed one is saved, checked, audited. */
export function SettingsPanel() {
  const { say } = useStatusLine();
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    settingsApi.read().then(
      (values) => {
        if (!live) return;
        setSaved(toDraft(values));
        setDraft(toDraft(values));
      },
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    if (!saved) return;
    const changed = FIELDS.filter(([key]) =>
      namesOf(key).some((name) => draft[name] !== saved[name]),
    );
    if (changed.length === 0) return say(text.unchanged, 'check');
    setBusy(true);
    let last: SettingKey | null = null;
    try {
      for (const [key, kind] of changed) {
        last = key;
        setSaved(toDraft(await settingsApi.write(key, fromDraft(draft, key, kind))));
      }
      setFailure(null);
      say(text.saved(changed.length), 'check');
    } catch (error) {
      const name = last === 'store.legal' ? text.groups.store : (text.fields[last ?? ''] ?? last);
      setFailure(`${name} : ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  return (
    <section
      aria-labelledby="settings"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden px-4 pt-3 pb-4`}
    >
      <header className="flex flex-col gap-1">
        <h2 id="settings" className="type-title">
          {text.title}
        </h2>
        <p className="text-ink-2">{text.help}</p>
      </header>
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      {saved && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {GROUPS.map(([group, fields]) => (
            <fieldset key={group} className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-2 font-semibold text-ink-2">{text.groups[group]}</legend>
              {fields.flatMap(([key, kind]) =>
                namesOf(key).map((name) => (
                  <Field
                    key={name}
                    name={name}
                    kind={kind}
                    value={draft[name] ?? ''}
                    disabled={busy}
                    onChange={(value) => setDraft((current) => ({ ...current, [name]: value }))}
                  />
                )),
              )}
            </fieldset>
          ))}
          <button
            type="submit"
            disabled={busy}
            className={buttonClass('primary', 'md', 'self-start')}
          >
            {text.save}
          </button>
        </form>
      )}
    </section>
  );
}

function Field({
  name,
  kind,
  value,
  disabled,
  onChange,
}: {
  name: string;
  kind: Kind;
  value: string | boolean;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const label = text.fields[name] ?? name;
  if (kind === 'check')
    return (
      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="size-5"
        />
        {label}
      </label>
    );
  return (
    <label className="flex flex-col gap-1 font-semibold">
      {label}
      {kind === 'list' ? (
        <textarea
          rows={4}
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD} py-2`}
        />
      ) : (
        <input
          value={String(value)}
          inputMode={kind === 'text' ? 'text' : 'decimal'}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD} h-12`}
        />
      )}
    </label>
  );
}
