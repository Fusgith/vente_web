import { REMOTE_ROLES, ROLES, TOTP_PATTERN, type Role } from '@vente-web/shared';
import { useId, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { useAuth } from './context.js';
import { RoleChoice } from './RoleChoice.js';
import { textLinkClass } from './user-look.js';

interface PasswordLoginProps {
  /** Outside the shop: owner/admin only, TOTP always required (RG-USR-04). */
  remote: boolean;
  /** Shown in the shop when PIN users exist. */
  onPinMode?: () => void;
  intro?: string | null;
}

const fieldClass = 'flex flex-col gap-1.5';
const inputClass = 'h-14 w-full rounded-control border border-rule-strong bg-white px-4 text-ink';

/** A calm note in the sheet (remote access, no PIN account yet). */
function Note({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-control bg-indigo-soft px-3 py-2.5 text-ink">
      <Icon name="info" className="size-5 translate-y-px text-indigo" />
      {children}
    </p>
  );
}

export function PasswordLogin({ remote, onPinMode, intro }: PasswordLoginProps) {
  const { signIn } = useAuth();
  const id = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  // The boss is the usual remote user; in the shop the role is always a deliberate choice.
  const [role, setRole] = useState<Role | null>(remote ? 'owner' : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const complete =
    username.trim() !== '' && password !== '' && (!remote || TOTP_PATTERN.test(totp));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !complete) return;
    if (role === null) {
      setError(labels.login.roleRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const base = { username: username.trim(), role, password };
      await signIn(remote ? { ...base, totp } : base);
    } catch (failure) {
      setError(errorMessage(failure));
      setPassword('');
      setTotp('');
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
        {labels.login.passwordTitle}
      </h2>
      {remote && <Note>{labels.login.remoteNotice}</Note>}
      {intro && <Note>{intro}</Note>}

      <label htmlFor={`${id}-username`} className={fieldClass}>
        <span className="font-semibold">{labels.login.username}</span>
        <input
          id={`${id}-username`}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
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
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`${inputClass} text-18`}
        />
      </label>

      <RoleChoice roles={remote ? REMOTE_ROLES : ROLES} value={role} onChange={setRole} />

      {remote && (
        <label htmlFor={`${id}-totp`} className={fieldClass}>
          <span className="font-semibold">{labels.login.totp}</span>
          <input
            id={`${id}-totp`}
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/\D/g, ''))}
            className={`${inputClass} figures max-w-60 text-24 font-semibold tracking-[0.3em]`}
          />
        </label>
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

      {onPinMode && (
        <button type="button" onClick={onPinMode} className={textLinkClass}>
          {labels.login.pinLink}
        </button>
      )}
    </form>
  );
}
