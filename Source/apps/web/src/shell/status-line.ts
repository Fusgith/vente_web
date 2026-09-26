import { createContext, useContext } from 'react';

import type { IconName } from '../ui/Icon.js';

/** The single sentence of the screen, printed in the frame's bottom band. */
export interface StatusMessage {
  text: string;
  tone: 'info' | 'error';
  /** Leading icon (saffron on the band); errors always show the alert icon. */
  icon: IconName | null;
  /** Bumped on every message, so the same sentence said twice is announced twice. */
  seq: number;
}

export interface StatusLine {
  message: StatusMessage | null;
  /** A plain sentence: « Ajouté : 3 pièce — Savon… » (`icon` e.g. 'check'). */
  say(text: string, icon?: IconName | null): void;
  /** An error sentence: a madder-soft pill with the alert icon, so colour is not the only cue. */
  sayError(text: string): void;
  clear(): void;
}

const noop = () => undefined;

/** Without a provider (a screen shown alone), saying something is harmless and shows nothing. */
export const StatusLineContext = createContext<StatusLine>({
  message: null,
  say: noop,
  sayError: noop,
  clear: noop,
});

export function useStatusLine(): StatusLine {
  return useContext(StatusLineContext);
}
