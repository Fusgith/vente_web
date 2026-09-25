import { REMOTE_ROLES, ROLES, TOTP_PATTERN, type Role } from '@vente-web/shared';
import { useId, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useAuth } from './context.js';
import { RoleChoice } from './RoleChoice.js';

interface PasswordLoginProps {
  /** Outside the shop: owner/admin only, TOTP always required (RG-USR-04). */
  remote: boolean;
  /** Shown in the shop when PIN users exist. */
  onPinMode?: () => void;
  intro?: string | null;
}

const inputClass =
  'min-h-12 w-full rounded-lg border-2 border-slate-300 bg-white px-3 text-lg focus:border-teal-700 focus:outline-none';

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
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h2 className="text-xl font-semibold text-slate-800">{labels.login.title}</h2>
      {remote && <p className="text-slate-600">{labels.login.remoteNotice}</p>}
      {intro && <p className="text-slate-600">{intro}</p>}

      <label htmlFor={`${id}-username`} className="flex flex-col gap-1">
        <span className="font-medium text-slate-700">{labels.login.username}</span>
        <input
          id={`${id}-username`}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className={inputClass}
        />
      </label>

      <label htmlFor={`${id}-password`} className="flex flex-col gap-1">
        <span className="font-medium text-slate-700">{labels.login.password}</span>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </label>

      <RoleChoice roles={remote ? REMOTE_ROLES : ROLES} value={role} onChange={setRole} />

      {remote && (
        <label htmlFor={`${id}-totp`} className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">{labels.login.totp}</span>
          <input
            id={`${id}-totp`}
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/\D/g, ''))}
            className={`${inputClass} tracking-[0.4em]`}
          />
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!complete || busy}
        className="min-h-14 rounded-xl bg-teal-700 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? labels.login.signingIn : labels.login.signIn}
      </button>

      {onPinMode && (
        <button
          type="button"
          onClick={onPinMode}
          className="self-start text-teal-700 underline underline-offset-4"
        >
          {labels.login.pinLink}
        </button>
      )}
    </form>
  );
}
