import type { Role } from '@vente-web/shared';
import type { ReactNode } from 'react';

import { labels } from '../labels.js';
import { Icon, type IconName } from '../ui/Icon.js';
import { useStatusLine } from './status-line.js';

/** Which cloth: its colour says where you are (indigo Ventes, green Caisse…). */
export type FrameWorkspace = 'login' | Role;

interface FrameProps {
  workspace: FrameWorkspace;
  /** Workspace name written after the wordmark: colour is never the only cue. */
  name: string;
  /** The wordmark is the page's `<h1>` (login screen); otherwise a plain span. */
  wordmarkHeading?: boolean;
  /** Right side of the top band (workspaces): user, role switch, sign out… use `buttonClass('band')`. */
  controls?: ReactNode;
  /**
   * A static sentence for the bottom band (login: an instruction), never a live region. Without
   * it (undefined), the band is the workspace's `role="status"` line fed by `useStatusLine()`;
   * `null` leaves the band empty and silent.
   */
  note?: ReactNode;
  noteIcon?: IconName;
  children: ReactNode;
}

/**
 * The lamba: a coloured cloth around every screen. Top band 48 px (icon, wordmark, workspace),
 * a 6 px ring printed with saffron rice grains, the cotton field, and a bottom band 40 px that
 * carries the one sentence of the screen, as a lamba carries its proverb.
 */
export function Frame({
  workspace,
  name,
  wordmarkHeading = false,
  controls,
  note,
  noteIcon,
  children,
}: FrameProps) {
  const Wordmark = wordmarkHeading ? 'h1' : 'span';
  return (
    <div
      data-workspace={workspace}
      className="flex min-h-dvh flex-col bg-frame text-white md:h-dvh md:overflow-hidden"
    >
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 pl-4">
        <div className="flex h-12 min-w-0 items-center gap-4">
          <span className="flex items-center gap-2.5">
            <img src="/icons/icon.svg" alt="" width={32} height={32} className="size-8" />
            <Wordmark className="type-wordmark text-21 leading-none whitespace-nowrap">
              {labels.appName}
            </Wordmark>
          </span>
          <span aria-hidden="true" className="h-6 w-0.5 shrink-0 rounded-full bg-saffron" />
          <span className="type-band truncate font-bold">{name}</span>
        </div>
        {controls && (
          <div className="ml-auto flex min-h-12 flex-wrap items-center justify-end self-stretch">
            {controls}
          </div>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col px-1">
        <div className="relative flex min-h-0 flex-1 flex-col p-1.5">
          <span aria-hidden="true" className="lamba-print-x absolute inset-x-0 top-0 h-1.5" />
          <span aria-hidden="true" className="lamba-print-x absolute inset-x-0 bottom-0 h-1.5" />
          <span aria-hidden="true" className="lamba-print-y absolute inset-y-1.5 left-0 w-1.5" />
          <span aria-hidden="true" className="lamba-print-y absolute inset-y-1.5 right-0 w-1.5" />
          <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-cotton p-3 text-ink">
            {children}
          </main>
        </div>
      </div>

      <footer className="sticky bottom-0 z-10 flex min-h-10 shrink-0 items-center justify-center bg-frame px-4 py-1 text-white md:h-10 md:py-0">
        {note === undefined ? (
          <StatusBand />
        ) : (
          <p className="type-band flex min-w-0 items-center gap-2.5 text-center">
            {noteIcon && <Icon name={noteIcon} className="size-5 text-saffron" />}
            <span className="md:truncate">{note}</span>
          </p>
        )}
      </footer>
    </div>
  );
}

/**
 * The live status line of a workspace: one sentence. Two regions, both always mounted so their
 * first message is announced: news waits its turn (polite status); an error interrupts (alert)
 * and shows in a madder-soft pill with an icon, so colour is not the only cue.
 */
function StatusBand() {
  const { message } = useStatusLine();
  const info = message?.tone === 'info' ? message : null;
  const error = message?.tone === 'error' ? message : null;
  return (
    <div className="type-band flex min-w-0 items-center justify-center text-center">
      <div role="status" aria-live="polite" className="flex min-w-0 items-center">
        {info && (
          <span key={info.seq} className="inline-flex min-w-0 items-center gap-2.5">
            {info.icon && <Icon name={info.icon} className="size-5 text-saffron" />}
            <span className="md:truncate">{info.text}</span>
          </span>
        )}
      </div>
      <div role="alert" className="flex min-w-0 items-center">
        {error && (
          <span
            key={error.seq}
            className="inline-flex min-w-0 items-center gap-2 rounded-full bg-madder-soft px-3 py-0.5 text-madder"
          >
            <Icon name="alert" className="size-5" />
            <span className="md:truncate">{error.text}</span>
          </span>
        )}
      </div>
    </div>
  );
}
