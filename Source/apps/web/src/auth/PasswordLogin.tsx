import { PASSWORD_MIN_LENGTH, TOTP_PATTERN } from '@vente-web/shared';
import { useId, useState, type FormEvent } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { useAuth } from './context.js';
import { OwnerActivation } from './OwnerActivation.js';
import { textLinkClass } from './user-look.js';

interface PasswordLoginProps {
  /** The account a lock for inactivity closed: its identifier is already typed. */
  initialUsername: string;
}

const fieldClass = 'flex flex-col gap-1.5';
const inputClass = 'h-14 w-full rounded-control border border-rule-strong bg-white px-4 text-ink';

/** A calm note in the sheet (code asked outside the shop, password just chosen). */
function Note({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-control bg-indigo-soft px-3 py-2.5 text-ink">
      <Icon name="info" className="size-5 translate-y-px text-indigo" />
      {children}
    </p>
  );
}

/**
 * Identifier and password, nothing to choose: the API opens the account's role (RG-USR-02,
 * RG-USR-03, H57). Outside the shop it asks owner/admin for a TOTP code (RG-USR-04): the field
 * appears then, the password typed is kept.
 */
export function PasswordLogin({ initialUsername }: PasswordLoginProps) {
  const { signIn } = useAuth();
  const id = useId();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  // Asked only when the API requires it: null until then.
  const [totp, setTotp] = useState<string | null>(null);
  // Asked only when the API says the password was set by the admin (H20): null until then.
  const [newPassword, setNewPassword] = useState<string | null>(null);
  // The owner's first password, chosen with the admin's one-time code (RG-USR-10).
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const complete =
    username.trim() !== '' &&
    password !== '' &&
    (totp === null || TOTP_PATTERN.test(totp)) &&
    (newPassword === null || newPassword.length >= PASSWORD_MIN_LENGTH);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !complete) return;
    setBusy(true);
    setError(null);
    try {
      await signIn({
        username: username.trim(),
        password,
        ...(totp !== null && { totp }),
        ...(newPassword !== null && { newPassword }),
      });
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : null;
      setBusy(false);
      if (code === 'AUTH_TOTP_REQUIRED' && totp === null) {
        // Not a mistake: the note explains, the password stays.
        setTotp('');
        return;
      }
      setError(errorMessage(failure));
      // The password was right: keep it (and the unspent TOTP code), ask only for the new one.
      if (code === 'AUTH_PASSWORD_CHANGE_REQUIRED' || code === 'AUTH_PASSWORD_UNCHANGED') {
        setNewPassword('');
      } else {
        setPassword('');
        if (totp !== null) setTotp('');
      }
    }
  };

  if (activating) {
    return (
      <OwnerActivation
        onDone={(name) => {
          setActivating(false);
          setActivated(true);
          setUsername(name);
          setPassword('');
        }}
        onCancel={() => setActivating(false)}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h2 className="type-title flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-frame text-white"
        >
          <Icon name="lock" className="size-5" />
        </span>
        {labels.login.formTitle}
      </h2>
      {totp !== null && <Note>{labels.login.remoteNotice}</Note>}
      {activated && <Note>{labels.login.activated}</Note>}

      <label htmlFor={`${id}-username`} className={fieldClass}>
        <span className="font-semibold">{labels.login.username}</span>
        <input
          id={`${id}-username`}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={initialUsername === ''}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={`${inputClass} text-18`}
        />
      </label>

      <label htmlFor={`${id}-password`} className={fieldClass}>
        <span className="font-semibold">{labels.login.password}</span>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus={initialUsername !== ''}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`${inputClass} text-18`}
        />
      </label>

      {totp !== null && (
        <label htmlFor={`${id}-totp`} className={fieldClass}>
          <span className="font-semibold">{labels.login.totp}</span>
          <input
            id={`${id}-totp`}
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/\D/g, ''))}
            className={`${inputClass} figures max-w-60 text-24 font-semibold tracking-[0.3em]`}
          />
        </label>
      )}

      {newPassword !== null && (
        <div className={fieldClass}>
          <label htmlFor={`${id}-new-password`} className="font-semibold">
            {labels.login.newPassword}
          </label>
          <input
            id={`${id}-new-password`}
            name="new-password"
            type="password"
            autoComplete="new-password"
            aria-describedby={`${id}-new-password-hint`}
            autoFocus
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className={`${inputClass} text-18`}
          />
          <span id={`${id}-new-password-hint`} className="text-14 text-ink-2">
            {labels.login.newPasswordHint(PASSWORD_MIN_LENGTH)}
          </span>
        </div>
      )}

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
        disabled={!complete || busy}
        className={buttonClass('primary', 'lg', 'w-full')}
      >
        {busy ? labels.login.signingIn : labels.login.signIn}
      </button>

      <button type="button" onClick={() => setActivating(true)} className={textLinkClass}>
        {labels.login.activationLink}
      </button>
    </form>
  );
}
