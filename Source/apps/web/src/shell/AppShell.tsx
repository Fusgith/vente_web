import { ROLE_LABELS, type AuthMe, type Role } from '@vente-web/shared';
import { useState, type ReactNode } from 'react';

import { errorMessage } from '../api/error-message.js';
import { useAuth } from '../auth/context.js';
import { switchableRoles } from '../auth/roles.js';
import { useIdleLock } from '../auth/useIdleLock.js';
import { labels } from '../labels.js';
import { SalesWorkspace } from '../sales/SalesWorkspace.js';
import { buttonClass, sheetClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import { Frame } from './Frame.js';
import { useStatusLine } from './status-line.js';
import { StatusLineProvider } from './StatusLineProvider.js';

interface AppShellProps {
  me: AuthMe;
  /** Stands in for the workspace (the design gallery shows it with demo lines). */
  children?: ReactNode;
}

/**
 * Signed-in frame: the lamba in the active role's colour, who is signed in, which role, sign out;
 * one workspace per active role. Its bottom band is the workspace's status line.
 */
export function AppShell({ me, children }: AppShellProps) {
  return (
    <StatusLineProvider>
      <Shell me={me}>{children}</Shell>
    </StatusLineProvider>
  );
}

function Shell({ me, children }: AppShellProps) {
  const { signOut, lock, keepAlive, switchRole } = useAuth();
  const { sayError, clear } = useStatusLine();
  const [busy, setBusy] = useState(false);
  const activeRole = me.session.activeRole;
  const roles = switchableRoles(me);

  useIdleLock(me.session.idleMinutes * 60_000, lock, keepAlive);

  const changeRole = async (role: Role) => {
    setBusy(true);
    clear();
    try {
      await switchRole(role);
    } catch (failure) {
      sayError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const controls = (
    <>
      {me.session.origin === 'REMOTE' && (
        <span className="mr-3 rounded-full bg-saffron px-3 py-0.5 text-14 font-bold text-ink">
          {labels.shell.remote}
        </span>
      )}
      <span className="flex flex-col items-end py-1 pr-4 text-right">
        <span className="font-semibold whitespace-nowrap">{me.user.fullName}</span>
        {roles.length <= 1 && (
          <span className="text-14 leading-5 text-white/80">{ROLE_LABELS[activeRole]}</span>
        )}
      </span>
      <span className="flex h-12 gap-0.5">
        {roles.length > 1 && (
          <label className="relative block h-12 w-48 bg-frame-deep text-white active:bg-frame-press">
            <span className="pointer-events-none absolute top-1 left-4 text-14 leading-5 font-medium text-white/80">
              {labels.shell.activeRole}
            </span>
            <select
              value={activeRole}
              disabled={busy}
              onChange={(event) => void changeRole(event.target.value as Role)}
              className="focus-frame absolute inset-0 appearance-none bg-transparent pt-5 pr-10 pl-4 text-16 leading-5 font-bold text-white disabled:opacity-70"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <Icon
              name="chevron"
              className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className={buttonClass('band', 'md', 'h-12')}
        >
          <Icon name="signOut" className="size-5" />
          {labels.shell.signOut}
        </button>
      </span>
    </>
  );

  return (
    <Frame workspace={activeRole} name={labels.workspaces[activeRole].title} controls={controls}>
      {children ?? <Workspace role={activeRole} />}
    </Frame>
  );
}

function Workspace({ role }: { role: Role }) {
  if (role === 'sales') return <SalesWorkspace />;
  const workspace = labels.workspaces[role];
  return (
    <section className={`${sheetClass} mx-auto mt-8 flex w-full max-w-2xl flex-col gap-3 p-8`}>
      <h1 className="type-title">{workspace.title}</h1>
      <p className="text-18 text-ink">{workspace.summary}</p>
      <p className="mt-3 flex items-center gap-3 border-t border-rule pt-5 text-ink-2">
        <Icon name="info" className="size-5" />
        {labels.shell.workspaceComing}
      </p>
    </section>
  );
}
