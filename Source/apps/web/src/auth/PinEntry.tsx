import { PIN_PATTERN, type AuthUserDirectory, type OperationalRole } from '@vente-web/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { EraseKey, Keypad } from '../ui/Keypad.js';
import { useAuth } from './context.js';
import { RoleChoice } from './RoleChoice.js';
import { UserDisc } from './UserTile.js';

type DirectoryUser = AuthUserDirectory['users'][number];

const PIN_MAX_LENGTH = 6;

/** The till's Enter key: indigo, as tall as the digits, beside the 0. */
const SUBMIT_KEY =
  'flex min-h-16 select-none items-center justify-center gap-2 rounded-key border border-indigo bg-indigo text-18 font-bold text-white transition-colors duration-100 active:border-indigo-deep active:bg-indigo-deep disabled:border-dashed disabled:border-rule-strong disabled:bg-cotton disabled:font-semibold disabled:text-ink-2';

interface PinEntryProps {
  user: DirectoryUser;
  initialRole: OperationalRole | null;
  /**
   * Chosen by a tap: the focus moves to the name, so a screen reader hears who was chosen and a
   * phone, where the directory hides, does not leave the focus on nothing.
   */
  takeFocus?: boolean;
  onCancel(): void;
}

/** The PIN sheet of the chosen user: who, the role, the dots and the pad (RG-USR-03). */
export function PinEntry({ user, initialRole, takeFocus = false, onCancel }: PinEntryProps) {
  const { signIn } = useAuth();
  const [role, setRole] = useState<OperationalRole | null>(initialRole);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  // The role is checked on submit, so a missing choice gets a message, not a dead button.
  const canSubmit = PIN_PATTERN.test(pin) && !busy;

  const press = (digit: string) => {
    setError(null);
    setPin((current) => (current.length >= PIN_MAX_LENGTH ? current : current + digit));
  };
  const erase = () => setPin((current) => current.slice(0, -1));

  useEffect(() => {
    if (takeFocus) nameRef.current?.focus();
  }, [takeFocus]);

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

  return (
    <form ref={formRef} onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-5">
      <div className="flex items-center gap-4">
        <UserDisc fullName={user.fullName} roles={user.roles} size="lg" />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h2
            ref={nameRef}
            tabIndex={-1}
            className="font-display text-24 font-bold [font-stretch:112%]"
          >
            {user.fullName}
          </h2>
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'md')}>
            {labels.login.otherUser}
          </button>
        </div>
      </div>

      {user.roles.length > 1 && (
        <RoleChoice<OperationalRole> roles={user.roles} value={role} onChange={setRole} />
      )}

      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="font-semibold">{labels.login.typePin}</span>
        <div role="status" aria-label={labels.login.pinEntered(pin.length)} className="flex gap-3">
          {/* Live regions speak their text, not their label: the count is also said in words. */}
          <span className="sr-only">{labels.login.pinEntered(pin.length)}</span>
          {Array.from({ length: PIN_MAX_LENGTH }, (_, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={`size-5 rounded-full border-2 ${
                index < pin.length ? 'border-ink bg-ink' : 'border-rule-strong bg-white'
              }`}
            />
          ))}
        </div>
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

      <Keypad
        size="lg"
        disabled={busy}
        onDigit={press}
        className="auto-rows-[4.5rem]"
        left={
          <EraseKey
            label={labels.login.erase}
            showLabel
            size="lg"
            disabled={busy}
            onErase={erase}
          />
        }
        right={
          <button type="submit" disabled={!canSubmit} className={SUBMIT_KEY}>
            {!busy && <Icon name="check" className="size-6" />}
            {busy ? labels.login.signingIn : labels.login.submit}
          </button>
        }
      />
    </form>
  );
}
