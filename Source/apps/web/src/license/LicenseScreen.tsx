import type { LicenseStatus } from '@vente-web/shared';
import { useId, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { licenseApi } from '../api/license.js';
import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';

interface LicenseScreenProps {
  status: LicenseStatus;
  onEntered(status: LicenseStatus): void;
  /** Only while the application still runs (a new key before the end of the trial). */
  onBack?: () => void;
}

/**
 * The lock screen of a server without a valid key (T-101, ADR-0010): why, this server's code
 * to send to the vendor, and the field for the key the vendor sends back.
 */
export function LicenseScreen({ status, onEntered, onBack }: LicenseScreenProps) {
  const id = useId();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reason =
    status.state === 'valid' || status.state === 'unchecked'
      ? null
      : labels.license.reasons[status.state];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || key.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      onEntered(await licenseApi.enter(key.replace(/\s+/g, '')));
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <Frame workspace="login" name={labels.license.title} wordmarkHeading note={labels.license.note}>
      <form
        onSubmit={submit}
        className={`${sheetClass} mx-auto my-auto flex w-full max-w-xl flex-col gap-4 p-5 sm:p-6`}
      >
        <h2 className="type-title flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-frame text-white"
          >
            <Icon name="lock" className="size-5" />
          </span>
          {reason ?? labels.license.changeTitle}
        </h2>
        <p className="text-ink-2">{labels.license.ask}</p>
        <p className="flex flex-col gap-1">
          <span className="font-semibold">{labels.license.machine}</span>
          <span className="figures text-24 font-semibold tracking-wider select-all">
            {status.machine}
          </span>
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-key`} className="font-semibold">
            {labels.license.key}
          </label>
          <textarea
            id={`${id}-key`}
            rows={4}
            autoFocus
            spellCheck={false}
            autoCapitalize="none"
            aria-describedby={`${id}-key-hint`}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="w-full rounded-control border border-rule-strong bg-white px-4 py-3 font-mono text-14 break-all text-ink"
          />
          <span id={`${id}-key-hint`} className="text-14 text-ink-2">
            {labels.license.keyHint}
          </span>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-control bg-madder-soft px-3 py-2.5 font-semibold text-madder"
          >
            <Icon name="alert" className="size-5 translate-y-px" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || key.trim() === ''}
          className={buttonClass('primary', 'lg', 'w-full')}
        >
          {busy ? labels.license.entering : labels.license.enter}
        </button>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={buttonClass('secondary', 'lg', 'w-full')}
          >
            {labels.license.back}
          </button>
        )}
      </form>
    </Frame>
  );
}
