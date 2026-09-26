import type { AuthUserDirectory } from '@vente-web/shared';
import { useEffect, useId, useRef, useState } from 'react';

import { labels } from '../labels.js';
import { sheetClass } from '../ui/button.js';
import { Icon } from '../ui/Icon.js';
import type { ResumeHint } from './context.js';
import { PinEntry } from './PinEntry.js';
import { UserTile } from './UserTile.js';
import { directoryLayout, textLinkClass } from './user-look.js';

type DirectoryUser = AuthUserDirectory['users'][number];

interface PinLoginProps {
  users: DirectoryUser[];
  resume: ResumeHint | null;
  onPasswordMode(): void;
}

/**
 * Shared station login (RG-USR-03): the directory on the left, the PIN sheet on the right, both
 * in view on a landscape tablet so « Changer d'utilisateur » is one visible tap. Stacked in
 * portrait; on a phone the chosen user's sheet replaces the directory.
 */
export function PinLogin({ users, resume, onPasswordMode }: PinLoginProps) {
  const titleId = useId();
  const layout = directoryLayout(users.length);
  const [selected, setSelected] = useState<DirectoryUser | null>(
    () => users.find((user) => user.username === resume?.username) ?? null,
  );
  /** Whether the PIN sheet was opened by a tap here (then it takes the focus), not by a resume. */
  const [tapped, setTapped] = useState(false);
  const directoryRef = useRef<HTMLUListElement>(null);
  /** The user whose sheet was just closed: their tile takes the focus back. */
  const leftRef = useRef<string | null>(null);

  useEffect(() => {
    if (selected !== null || leftRef.current === null) return;
    const tile = directoryRef.current?.querySelector<HTMLButtonElement>(
      `[data-user-id="${CSS.escape(leftRef.current)}"] button`,
    );
    leftRef.current = null;
    tile?.focus();
  }, [selected]);

  const choose = (user: DirectoryUser) => {
    setTapped(true);
    setSelected(user);
  };
  const leave = () => {
    leftRef.current = selected?.id ?? null;
    setSelected(null);
  };

  let sheet;
  if (selected) {
    const resumeRole = resume?.username === selected.username ? resume.role : null;
    const initialRole =
      selected.roles.find((role) => role === resumeRole) ??
      (selected.roles.length === 1 ? selected.roles[0] : undefined) ??
      null;
    sheet = (
      <PinEntry
        key={selected.id}
        user={selected}
        initialRole={initialRole}
        takeFocus={tapped}
        onCancel={leave}
      />
    );
  } else {
    sheet = (
      <div className="m-auto flex max-w-xs flex-col items-center gap-4 py-8 text-center text-ink-2">
        <span className="flex size-16 items-center justify-center rounded-full bg-cotton">
          <Icon name="lock" className="size-8" />
        </span>
        <p className="text-18">{labels.login.pinInvitation}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row lg:gap-6">
      <section
        aria-labelledby={titleId}
        className={`flex flex-col gap-3 lg:min-h-0 lg:flex-1 ${selected ? 'max-md:hidden' : ''}`}
      >
        <h2 id={titleId} className="type-title pt-1">
          {labels.login.chooseUser}
        </h2>
        <ul
          ref={directoryRef}
          className={`-m-1 grid content-start gap-2 p-1 lg:min-h-0 lg:overflow-auto ${layout.grid}`}
        >
          {users.map((user) => (
            <li key={user.id} data-user-id={user.id}>
              <UserTile
                fullName={user.fullName}
                roles={user.roles}
                size={layout.tile}
                chosen={selected?.id === user.id}
                onChoose={() => choose(user)}
              />
            </li>
          ))}
        </ul>
        <button type="button" onClick={onPasswordMode} className={`${textLinkClass} lg:mt-auto`}>
          {labels.login.passwordLink}
        </button>
      </section>

      <div
        className={`${sheetClass} flex flex-col p-5 lg:w-[30rem] lg:flex-none lg:overflow-auto ${
          // Stacked (portrait), the invitation is a short sheet; the PIN pad fills the rest.
          selected ? 'flex-1' : 'max-md:hidden'
        }`}
      >
        {sheet}
      </div>
    </div>
  );
}
