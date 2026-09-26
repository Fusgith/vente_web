import { useCallback, useMemo, useState, type ReactNode } from 'react';

import type { IconName } from '../ui/Icon.js';
import { StatusLineContext, type StatusLine, type StatusMessage } from './status-line.js';

/** Holds the one status sentence of a workspace; the frame's bottom band shows it. */
export function StatusLineProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const say = useCallback((text: string, icon: IconName | null = null) => {
    setMessage((previous) => ({ text, tone: 'info', icon, seq: (previous?.seq ?? 0) + 1 }));
  }, []);
  const sayError = useCallback((text: string) => {
    setMessage((previous) => ({
      text,
      tone: 'error',
      icon: 'alert',
      seq: (previous?.seq ?? 0) + 1,
    }));
  }, []);
  const clear = useCallback(() => setMessage(null), []);

  const value = useMemo<StatusLine>(
    () => ({ message, say, sayError, clear }),
    [message, say, sayError, clear],
  );
  return <StatusLineContext value={value}>{children}</StatusLineContext>;
}
