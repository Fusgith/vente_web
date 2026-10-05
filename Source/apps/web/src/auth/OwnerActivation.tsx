import { activateBodySchema, PASSWORD_MIN_LENGTH } from '@vente-web/shared';
import { useId, useState, type FormEvent } from 'react';

import { authApi } from '../api/auth.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { textLinkClass } from './user-look.js';

const text = labels.login;
const fieldClass = 'flex flex-col gap-1.5';
const inputClass = 'h-14 w-full rounded-control border border-rule-strong bg-white px-4 text-ink';

interface OwnerActivationProps {
  /** The password is set: back to the login, the username kept. */
  onDone: (username: string) => void;
  onCancel: () => void;
}

/**
 * The owner chooses their own password with the one-time code the admin handed over (T-016g,
 * RG-USR-10): the admin never knows it. No session opens here; the owner then logs in.
 */
export function OwnerActivation({ onDone, onCancel }: OwnerActivationProps) {
  const id = useId();
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = { username: username.trim(), code: code.trim(), password };
  const ready = activateBodySchema.safeParse(body).success && !busy;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.activate(body);
      onDone(body.username);
    } catch (failure) {
      // A wrong code is a guess: it is typed again, the password with it.
      setError(errorMessage(failure));
      setCode('');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="type-title flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-frame text-white"
        >
          <Icon name="lock" className="size-5" />
        </span>
        {text.activationTitle}
      </h2>
      <p className="text-ink-2">{text.activationHelp}</p>

      <label htmlFor={`${id}-username`} className={fieldClass}>
        <span className="font-semibold">{text.username}</span>
        <input
          id={`${id}-username`}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={inputClass}
        />
      </label>
      <label htmlFor={`${id}-code`} className={fieldClass}>
        <span className="font-semibold">{text.activationCode}</span>
        <input
          id={`${id}-code`}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className={`${inputClass} figures tracking-wider`}
        />
      </label>
      <div className={fieldClass}>
        <label htmlFor={`${id}-password`} className="font-semibold">
          {text.newPassword}
        </label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          aria-describedby={`${id}-password-hint`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
        <span id={`${id}-password-hint`} className="text-14 text-ink-2">
          {text.activationPasswordHint(PASSWORD_MIN_LENGTH)}
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

      <button type="submit" disabled={!ready} className={buttonClass('primary', 'lg', 'w-full')}>
        {busy ? text.activating : text.activate}
      </button>
      <button type="button" onClick={onCancel} className={textLinkClass}>
        {text.backToLogin}
      </button>
    </form>
  );
}
