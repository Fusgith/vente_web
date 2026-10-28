import { LICENSE_NOTICE_DAYS, type LicenseStatus } from '@vente-web/shared';
import { createContext, useContext } from 'react';

interface LicenseContextValue {
  /** null when the server did not answer. */
  status: LicenseStatus | null;
  /** Opens the lock screen to enter a new key before the trial ends. */
  change(): void;
}

export const LicenseContext = createContext<LicenseContextValue | null>(null);

export function useLicense(): LicenseContextValue | null {
  return useContext(LicenseContext);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days left of a trial in its last week (H82), counting today; null otherwise. */
export function trialDaysLeft(status: LicenseStatus | null, now = Date.now()): number | null {
  if (status?.state !== 'valid' || status.expires === null) return null;
  const days = Math.ceil((Date.parse(status.expires) - now) / DAY_MS);
  return days <= LICENSE_NOTICE_DAYS ? Math.max(days, 1) : null;
}
