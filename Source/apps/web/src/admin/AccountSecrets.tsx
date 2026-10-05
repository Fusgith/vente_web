import {
  formatDate,
  formatTime,
  isOperationalRole,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
  PIN_PATTERN,
  type ActivationCode,
  type UserAccount,
} from '@vente-web/shared';
import { useId, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { usersApi } from '../api/users.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';

const text = labels.accounts.secrets;
const inputClass = 'h-12 rounded-control border border-rule-strong bg-white px-3 text-ink';

interface AccountSecretsProps {
  account: UserAccount;
  /** Read against the time the list came, as the list does. */
  locked: boolean;
  onChanged: (account: UserAccount) => void;
}

/**
 * The ways in of one account (T-016f, annexe B): the admin sets a PIN or a password without ever
 * seeing the old one (H20), hands the owner a one-time code instead of a password (RG-USR-10),
 * lifts a lock (RG-USR-05), forgets a TOTP, closes the sessions.
 */
export function AccountSecrets({ account, locked, onChanged }: AccountSecretsProps) {
  const id = useId();
  const { say } = useStatusLine();
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState<ActivationCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const owner = account.roles.includes('owner');
  const name = account.fullName;

  /** One request at a time: the list learns what changed, the band says it. */
  const run = async (send: () => Promise<void>, changed: Partial<UserAccount>, done: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await send();
      onChanged({ ...account, ...changed });
      say(done, 'check');
      return true;
    } catch (error) {
      setFailure(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sent = await run(
      () => usersApi.setPin(account.id, pin),
      { hasPin: true },
      text.pinSet(name),
    );
    if (sent) setPin('');
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sent = await run(
      () => usersApi.setPassword(account.id, password),
      { hasPassword: true, passwordChangeRequired: true },
      text.passwordSet(name),
    );
    if (sent) setPassword('');
  };

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mx-4 flex flex-col gap-4 rounded-control border border-rule p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-title`} className="font-semibold">
          {text.title(name)}
        </h3>
        <p className="text-14 text-ink-2">{text.help}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {account.roles.some(isOperationalRole) && (
          <form onSubmit={submitPin} aria-label={text.setPin} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-pin`} className="font-semibold">
              {text.pin}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`${id}-pin`}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                aria-describedby={`${id}-pin-hint`}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className={`${inputClass} figures w-32`}
              />
              <button
                type="submit"
                disabled={busy || !PIN_PATTERN.test(pin)}
                className={buttonClass('secondary', 'md')}
              >
                {text.setPin}
              </button>
            </div>
            <span id={`${id}-pin-hint`} className="text-14 text-ink-2">
              {text.pinHint}
            </span>
          </form>
        )}
        {owner ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-14 text-ink-2">{text.ownerHelp}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => setCode(await usersApi.activationCode(account.id)),
                  {},
                  text.codeIssued(name),
                )
              }
              className={buttonClass('secondary', 'md')}
            >
              {text.issueCode}
            </button>
            {code && (
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{text.code}</span>
                <span className="figures text-24 font-semibold tracking-wider">{code.code}</span>
                <span className="text-14 text-ink-2">
                  {text.codeUntil(formatDate(code.expiresAt), formatTime(code.expiresAt))}
                </span>
              </div>
            )}
          </div>
        ) : (
          <form
            onSubmit={submitPassword}
            aria-label={text.setPassword}
            className="flex flex-col gap-1.5"
          >
            <label htmlFor={`${id}-password`} className="font-semibold">
              {text.password}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`${id}-password`}
                type="password"
                autoComplete="new-password"
                aria-describedby={`${id}-password-hint`}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button
                type="submit"
                disabled={busy || !passwordSchema.safeParse(password).success}
                className={buttonClass('secondary', 'md')}
              >
                {text.setPassword}
              </button>
            </div>
            <span id={`${id}-password-hint`} className="text-14 text-ink-2">
              {text.passwordHint(PASSWORD_MIN_LENGTH)}
            </span>
          </form>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {locked && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => usersApi.unlock(account.id),
                { lockedUntil: null },
                text.unlocked(name),
              )
            }
            className={buttonClass('secondary', 'md')}
          >
            {text.unlock}
          </button>
        )}
        {account.totpEnabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () => usersApi.resetTotp(account.id),
                { totpEnabled: false },
                text.totpReset(name),
              )
            }
            className={buttonClass('secondary', 'md')}
          >
            {text.resetTotp}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => usersApi.closeSessions(account.id), {}, text.sessionsClosed(name))
          }
          className={buttonClass('secondary', 'md')}
        >
          {text.closeSessions}
        </button>
      </div>
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
    </section>
  );
}
