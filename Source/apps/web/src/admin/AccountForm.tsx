import {
  createUserBodySchema,
  ROLE_LABELS,
  ROLES,
  type Role,
  type UpdateUserBody,
  type UserAccount,
} from '@vente-web/shared';
import { useId, useState, type FormEvent } from 'react';

import { errorMessage } from '../api/error-message.js';
import { usersApi } from '../api/users.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';

const text = labels.accounts;
const fieldClass = 'flex flex-col gap-1.5';
const inputClass = 'h-12 w-full rounded-control border border-rule-strong bg-white px-3 text-ink';

interface AccountFormProps {
  /** null: a new account. */
  account: UserAccount | null;
  onSaved: (account: UserAccount, created: boolean) => void;
  onCancel: () => void;
}

/** Only what the admin changed is sent: a change of roles or a deactivation closes the sessions. */
type AccountFields = Pick<
  UserAccount,
  'username' | 'fullName' | 'roles' | 'ticketLetter' | 'isActive'
>;

function changesOf(account: UserAccount, next: AccountFields): UpdateUserBody {
  const changes: UpdateUserBody = {};
  if (next.username !== account.username) changes.username = next.username;
  if (next.fullName !== account.fullName) changes.fullName = next.fullName;
  if (next.roles.join() !== account.roles.join()) changes.roles = next.roles;
  if (next.ticketLetter !== account.ticketLetter) changes.ticketLetter = next.ticketLetter;
  if (next.isActive !== account.isActive) changes.isActive = next.isActive;
  return changes;
}

/**
 * Creates or changes an account (T-016e, annexe B): username, name, roles, the sales clerk's ticket
 * letter (RG-USR-07), active or not. Never a deletion (RG-USR-06); secrets are set apart.
 */
export function AccountForm({ account, onSaved, onCancel }: AccountFormProps) {
  const id = useId();
  const [username, setUsername] = useState(account?.username ?? '');
  const [fullName, setFullName] = useState(account?.fullName ?? '');
  const [roles, setRoles] = useState<Role[]>(account?.roles ?? []);
  const [letter, setLetter] = useState(account?.ticketLetter ?? '');
  const [isActive, setIsActive] = useState(account?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const sales = roles.includes('sales');
  const body = {
    username: username.trim(),
    fullName: fullName.trim(),
    // Kept in the shop's order, whatever the order of the clicks.
    roles: ROLES.filter((role) => roles.includes(role)),
    ticketLetter: sales ? letter.trim().toUpperCase() : null,
  };
  const next = { ...body, isActive };
  const valid = createUserBodySchema.safeParse(body).success;
  const changes = account && changesOf(account, next);
  const ready = valid && !busy && (changes === null || Object.keys(changes).length > 0);

  const toggle = (role: Role, on: boolean) =>
    setRoles((list) => (on ? [...list, role] : list.filter((kept) => kept !== role)));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setFailure(null);
    try {
      const saved = account
        ? await usersApi.update(account.id, changesOf(account, next))
        : await usersApi.create(body);
      onSaved(saved, account === null);
    } catch (error) {
      setFailure(errorMessage(error));
      setBusy(false);
    }
  };

  const title = account ? text.formEdit(account.fullName) : text.formNew;
  return (
    <form
      onSubmit={submit}
      aria-label={title}
      className="mx-4 flex flex-col gap-4 rounded-control border border-indigo bg-indigo-soft p-4"
    >
      <h3 className="font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldClass}>
          <label htmlFor={`${id}-username`} className="font-semibold">
            {text.username}
          </label>
          <input
            id={`${id}-username`}
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${id}-username-hint`}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={inputClass}
          />
          <span id={`${id}-username-hint`} className="text-14 text-ink-2">
            {text.usernameHint}
          </span>
        </div>
        <label htmlFor={`${id}-name`} className={fieldClass}>
          <span className="font-semibold">{text.fullName}</span>
          <input
            id={`${id}-name`}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="mb-1.5 font-semibold">{text.roles}</legend>
        {ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={roles.includes(role)}
              onChange={(event) => toggle(role, event.target.checked)}
              className="size-5"
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </fieldset>
      {sales && (
        <div className={fieldClass}>
          <label htmlFor={`${id}-letter`} className="font-semibold">
            {text.ticketLetter}
          </label>
          <input
            id={`${id}-letter`}
            maxLength={1}
            aria-describedby={`${id}-letter-hint`}
            value={letter}
            onChange={(event) => setLetter(event.target.value.toUpperCase())}
            className={`${inputClass} figures w-20 text-center text-18 font-semibold`}
          />
          <span id={`${id}-letter-hint`} className="text-14 text-ink-2">
            {text.ticketLetterHint}
          </span>
        </div>
      )}
      {account && (
        <>
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="size-5"
            />
            {text.active}
          </label>
          <p className="text-14 text-ink-2">{text.closesSessions}</p>
        </>
      )}
      {failure && (
        <p role="alert" className="font-semibold text-madder">
          {failure}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!ready} className={buttonClass('primary', 'md')}>
          {busy ? text.saving : account ? text.save : text.create}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass('secondary', 'md')}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
}
