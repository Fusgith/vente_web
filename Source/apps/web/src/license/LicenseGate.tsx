import type { LicenseStatus } from '@vente-web/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { LICENSE_REQUIRED_EVENT } from '../api/client.js';
import { licenseApi } from '../api/license.js';
import { LicenseContext } from './context.js';
import { LicenseScreen } from './LicenseScreen.js';

const OPEN_STATES = new Set<LicenseStatus['state']>(['valid', 'unchecked']);

/**
 * Every screen of the application sits behind the server's trial license (T-101, ADR-0010):
 * while it is locked, the lock screen asks for a key instead. A failed check lets the screen
 * through, which reports its own network errors.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  // undefined while the first answer is awaited: the API answers fast on the shop's network.
  const [status, setStatus] = useState<LicenseStatus | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);

  const check = useCallback(() => {
    licenseApi.status().then(setStatus, () => setStatus(null));
  }, []);

  useEffect(() => {
    check();
    window.addEventListener(LICENSE_REQUIRED_EVENT, check);
    return () => window.removeEventListener(LICENSE_REQUIRED_EVENT, check);
  }, [check]);

  if (status === undefined) return null;
  const locked = status !== null && !OPEN_STATES.has(status.state);
  if (status !== null && (locked || changing)) {
    return (
      <LicenseScreen
        status={status}
        onEntered={(entered) => {
          setStatus(entered);
          setChanging(false);
        }}
        {...(locked ? {} : { onBack: () => setChanging(false) })}
      />
    );
  }
  return (
    <LicenseContext.Provider value={{ status, change: () => setChanging(true) }}>
      {children}
    </LicenseContext.Provider>
  );
}
