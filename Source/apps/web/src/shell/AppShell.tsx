import { ROLE_LABELS, type AuthMe, type Role } from '@vente-web/shared';
import { useState } from 'react';

import { errorMessage } from '../api/error-message.js';
import { useAuth } from '../auth/context.js';
import { switchableRoles } from '../auth/roles.js';
import { useIdleLock } from '../auth/useIdleLock.js';
import { labels } from '../labels.js';

/** Signed-in frame: who, which role, sign out; one workspace per active role. */
export function AppShell({ me }: { me: AuthMe }) {
  const { signOut, lock, keepAlive, switchRole } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeRole = me.session.activeRole;
  const roles = switchableRoles(me);

  useIdleLock(me.session.idleMinutes * 60_000, lock, keepAlive);

  const changeRole = async (role: Role) => {
    setBusy(true);
    setError(null);
    try {
      await switchRole(role);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="flex flex-wrap items-center gap-3 bg-teal-700 px-4 py-2 text-white">
        <span className="text-lg font-bold">{labels.appName}</span>
        <span className="ml-auto font-medium">{me.user.fullName}</span>
        {me.session.origin === 'REMOTE' && (
          <span className="rounded-full bg-amber-300 px-3 py-1 text-sm font-semibold text-amber-950">
            {labels.shell.remote}
          </span>
        )}
        {roles.length > 1 ? (
          <label className="flex items-center">
            <span className="sr-only">{labels.shell.activeRole}</span>
            <select
              value={activeRole}
              disabled={busy}
              onChange={(event) => void changeRole(event.target.value as Role)}
              className="min-h-11 rounded-lg bg-teal-800 px-3 text-white"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded-lg bg-teal-800 px-3 py-2">{ROLE_LABELS[activeRole]}</span>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-11 rounded-lg border border-white/60 px-4 font-medium hover:bg-teal-800"
        >
          {labels.shell.signOut}
        </button>
      </header>
      {error && (
        <p role="alert" className="bg-red-50 px-4 py-3 text-red-800">
          {error}
        </p>
      )}
      <main className="flex-1 p-4 sm:p-6">
        <Workspace role={activeRole} />
      </main>
    </div>
  );
}

function Workspace({ role }: { role: Role }) {
  const workspace = labels.workspaces[role];
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-3">
      <h1 className="text-2xl font-bold text-slate-900">{workspace.title}</h1>
      <p className="text-lg text-slate-700">{workspace.summary}</p>
      <p className="rounded-lg bg-white p-4 text-slate-600 ring-1 ring-slate-200">
        {labels.shell.workspaceComing}
      </p>
    </section>
  );
}
