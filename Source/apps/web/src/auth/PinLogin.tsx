import {
  PIN_PATTERN,
  ROLE_LABELS,
  type AuthUserDirectory,
  type OperationalRole,
} from '@vente-web/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { useAuth, type ResumeHint } from './context.js';
import { RoleChoice } from './RoleChoice.js';

type DirectoryUser = AuthUserDirectory['users'][number];

const PIN_MAX_LENGTH = 6;
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

interface PinLoginProps {
  users: DirectoryUser[];
  resume: ResumeHint | null;
  onPasswordMode(): void;
}

/** Shared station login (RG-USR-03): pick your name, then type your PIN. */
export function PinLogin({ users, resume, onPasswordMode }: PinLoginProps) {
  const [selected, setSelected] = useState<DirectoryUser | null>(
    () => users.find((user) => user.username === resume?.username) ?? null,
  );

  if (selected) {
    const resumeRole = resume?.username === selected.username ? resume.role : null;
    const initialRole =
      selected.roles.find((role) => role === resumeRole) ??
      (selected.roles.length === 1 ? selected.roles[0] : undefined) ??
      null;
    return (
      <PinEntry
        key={selected.id}
        user={selected}
        initialRole={initialRole}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-slate-800">{labels.login.chooseUser}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => setSelected(user)}
              className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-slate-200 bg-white p-3 text-center hover:border-teal-600 focus-visible:border-teal-700"
            >
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-lg font-bold text-teal-800"
              >
                {initials(user.fullName)}
              </span>
              <span className="text-lg font-medium text-slate-900">{user.fullName}</span>
              <span className="text-sm text-slate-500">
                {user.roles.map((role) => ROLE_LABELS[role]).join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onPasswordMode}
        className="self-start text-teal-700 underline underline-offset-4"
      >
        {labels.login.passwordLink}
      </button>
    </div>
  );
}

interface PinEntryProps {
  user: DirectoryUser;
  initialRole: OperationalRole | null;
  onCancel(): void;
}

function PinEntry({ user, initialRole, onCancel }: PinEntryProps) {
  const { signIn } = useAuth();
  const [role, setRole] = useState<OperationalRole | null>(initialRole);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The role is checked on submit, so a missing choice gets a message, not a dead button.
  const canSubmit = PIN_PATTERN.test(pin) && !busy;

  const press = (digit: string) => {
    setError(null);
    setPin((current) => (current.length >= PIN_MAX_LENGTH ? current : current + digit));
  };
  const erase = () => setPin((current) => current.slice(0, -1));

  // A register or a counter PC has a keyboard: digits, Backspace, Enter and Escape work too.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (/^\d$/.test(event.key)) {
        setError(null);
        setPin((current) => (current.length >= PIN_MAX_LENGTH ? current : current + event.key));
      } else if (event.key === 'Backspace') {
        setPin((current) => current.slice(0, -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        formRef.current?.requestSubmit();
      } else if (event.key === 'Escape') {
        onCancelRef.current();
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (role === null) {
      setError(labels.login.roleRequired);
      return;
    }
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signIn({ username: user.username, role, pin });
    } catch (failure) {
      setError(errorMessage(failure));
      setPin('');
      setBusy(false);
    }
  };

  const keyClass =
    'min-h-16 rounded-xl bg-white text-2xl font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 active:bg-teal-50 disabled:opacity-40';

  return (
    <form ref={formRef} onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-slate-900">{user.fullName}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-teal-700 underline underline-offset-4"
        >
          {labels.login.otherUser}
        </button>
      </div>

      {user.roles.length > 1 && (
        <RoleChoice<OperationalRole> roles={user.roles} value={role} onChange={setRole} />
      )}

      <div className="flex flex-col items-center gap-2">
        <span className="text-slate-600">{labels.login.typePin}</span>
        <div role="status" aria-label={labels.login.pinEntered(pin.length)} className="flex gap-3">
          {Array.from({ length: PIN_MAX_LENGTH }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`size-4 rounded-full ${index < pin.length ? 'bg-teal-700' : 'bg-slate-200'}`}
            />
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-center text-red-800">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {KEYPAD.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className={keyClass}
            disabled={busy}
          >
            {digit}
          </button>
        ))}
        <button type="button" onClick={erase} className={`${keyClass} text-base`} disabled={busy}>
          {labels.login.erase}
        </button>
        <button type="button" onClick={() => press('0')} className={keyClass} disabled={busy}>
          0
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-16 rounded-xl bg-teal-700 text-lg font-semibold text-white disabled:opacity-40"
        >
          {busy ? labels.login.signingIn : labels.login.submit}
        </button>
      </div>
    </form>
  );
}
