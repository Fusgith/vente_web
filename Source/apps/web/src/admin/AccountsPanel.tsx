import { ROLE_LABELS, type UserAccount } from '@vente-web/shared';
import { useEffect, useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { usersApi } from '../api/users.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { AccountForm } from './AccountForm.js';
import { AccountSecrets } from './AccountSecrets.js';

const text = labels.accounts;
const ROW = `${CELL} h-14 border-b border-rule py-1`;

function isLocked(account: UserAccount, now: number): boolean {
  return account.lockedUntil !== null && Date.parse(account.lockedUntil) > now;
}

function stateOf(account: UserAccount, now: number): string {
  if (!account.isActive) return text.state.inactive;
  return isLocked(account, now) ? text.state.locked : text.state.active;
}

/** Which ways in exist, never the secrets themselves. */
function accessOf(account: UserAccount): string {
  const ways = [
    account.hasPassword &&
      (account.passwordChangeRequired ? text.access.passwordToChange : text.access.password),
    account.totpEnabled && text.access.totp,
  ].filter((way) => way !== false);
  return ways.length > 0 ? ways.join(', ') : text.access.none;
}

/**
 * The admin's accounts (T-016e, annexe B): the list with each account's state and ways in, a new
 * account, a change of name, roles, ticket letter, or a deactivation; then its ways in (T-016f).
 * Never a deletion (RG-USR-06).
 */
export function AccountsPanel() {
  const { say } = useStatusLine();
  const [accounts, setAccounts] = useState<UserAccount[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // A lock is read against the time the list came: the screen does not tick.
  const [loadedAt, setLoadedAt] = useState(0);
  // null: no form; 'new': a new account; otherwise the account being changed.
  const [editing, setEditing] = useState<UserAccount | 'new' | null>(null);

  useEffect(() => {
    usersApi.list().then(
      (list) => {
        setAccounts(list);
        setLoadedAt(Date.now());
      },
      (error: unknown) => setFailure(errorMessage(error)),
    );
  }, []);

  const saved = (account: UserAccount, created: boolean) => {
    setAccounts((list) =>
      created
        ? [...(list ?? []), account]
        : (list?.map((kept) => (kept.id === account.id ? account : kept)) ?? null),
    );
    setEditing(null);
    say((created ? text.created : text.saved)(account.fullName), 'check');
  };

  // A secret changed: the form stays open on the same account.
  const changed = (account: UserAccount) => {
    setAccounts((list) => list?.map((kept) => (kept.id === account.id ? account : kept)) ?? null);
    setEditing(account);
  };

  return (
    <section
      aria-labelledby="accounts"
      className={`${sheetClass} mx-auto mt-6 flex w-full max-w-4xl flex-col gap-3 overflow-hidden pb-4`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div className="flex flex-col gap-1">
          <h2 id="accounts" className="type-title">
            {text.title}
          </h2>
          <p className="text-ink-2">{text.help}</p>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={buttonClass('primary', 'md')}
          >
            {text.add}
          </button>
        )}
      </header>
      {failure && (
        <p role="alert" className="px-4 font-semibold text-madder">
          {failure}
        </p>
      )}
      {editing !== null && (
        <AccountForm
          key={editing === 'new' ? 'new' : editing.id}
          account={editing === 'new' ? null : editing}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing !== null && editing !== 'new' && (
        <AccountSecrets
          key={editing.id}
          account={editing}
          locked={isLocked(editing, loadedAt)}
          onChanged={changed}
        />
      )}
      {accounts && (
        <div className="overflow-x-auto">
          <table
            aria-label={text.list}
            className="w-full min-w-[48rem] table-fixed border-separate border-spacing-0 text-left"
          >
            <thead>
              <tr>
                <th className={`${HEAD} w-32`}>{text.head.username}</th>
                <th className={HEAD}>{text.head.fullName}</th>
                <th className={HEAD}>{text.head.roles}</th>
                <th className={`${HEAD} w-20`}>{text.head.letter}</th>
                <th className={`${HEAD} w-28`}>{text.head.state}</th>
                <th className={HEAD}>{text.head.access}</th>
                <th className={`${HEAD} w-32`} />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className={account.isActive ? undefined : 'text-ink-2'}>
                  <td className={`${ROW} font-semibold`}>{account.username}</td>
                  <td className={ROW}>{account.fullName}</td>
                  <td className={ROW}>
                    {account.roles.map((role) => ROLE_LABELS[role]).join(', ')}
                  </td>
                  <td className={`${ROW} figures`}>{account.ticketLetter}</td>
                  <td className={ROW}>{stateOf(account, loadedAt)}</td>
                  <td className={ROW}>{accessOf(account)}</td>
                  <td className={ROW}>
                    <button
                      type="button"
                      aria-label={text.edit(account.fullName)}
                      onClick={() => setEditing(account)}
                      className={buttonClass('secondary', 'md')}
                    >
                      {text.editGo}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
