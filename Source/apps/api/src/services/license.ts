import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';

import { MACHINE_CODE_PATTERN, type LicenseStatus } from '@vente-web/shared';
import { z } from 'zod';

/** What the vendor signed (ADR-0010): `expires` is the end of the trial's last day, or null. */
const termsSchema = z.object({
  client: z.string().min(1),
  machine: z.string().regex(MACHINE_CODE_PATTERN),
  expires: z.iso.datetime({ offset: true }).nullable(),
});
export type LicenseTerms = z.infer<typeof termsSchema>;

/** A clock this far behind the latest moment the server saw has been turned back (H83). */
export const CLOCK_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * The terms of a key `base64url(JSON).base64url(Ed25519 signature)`, or null when it is
 * malformed or was not signed by the vendor.
 */
export function readLicenseKey(key: string, publicKey: string): LicenseTerms | null {
  const [payload, signature, extra] = key.trim().split('.');
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const vendor = createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (!verify(null, Buffer.from(payload), vendor, Buffer.from(signature, 'base64url'))) {
      return null;
    }
    const terms = termsSchema.safeParse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    return terms.success ? terms.data : null;
  } catch {
    return null;
  }
}

export interface LicenseCheck {
  key: string | null;
  /** The latest moment the server saw, kept with the key. */
  lastSeen: Date | null;
  publicKey: string;
  machine: string;
  now: Date;
}

/** Whether the application may run on this server now (ADR-0010). */
export function evaluateLicense(check: LicenseCheck): LicenseStatus {
  const base = { machine: check.machine, client: null, expires: null };
  if (check.key === null) return { ...base, state: 'missing' };
  const terms = readLicenseKey(check.key, check.publicKey);
  if (terms === null) return { ...base, state: 'invalid' };
  const read = { ...base, client: terms.client, expires: terms.expires };
  if (terms.machine !== check.machine) return { ...read, state: 'other-machine' };
  const now = check.now.getTime();
  if (check.lastSeen !== null && now < check.lastSeen.getTime() - CLOCK_TOLERANCE_MS) {
    return { ...read, state: 'clock' };
  }
  if (terms.expires !== null && now > Date.parse(terms.expires)) {
    return { ...read, state: 'expired' };
  }
  return { ...read, state: 'valid' };
}

/** Windows' installation identifier: it stays until Windows is reinstalled. */
function machineIdentifier(): string {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true },
      );
      const guid = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(output)?.[1];
      if (guid) return guid;
    } else {
      return readFileSync('/etc/machine-id', 'utf8').trim();
    }
  } catch {
    // The computer's name below, a weaker identifier, rather than no code at all.
  }
  return hostname();
}

/** This server's code, shown on the lock screen and written into its key (ADR-0010). */
export function machineCode(identifier = machineIdentifier()): string {
  const digest = createHash('sha256').update(`vente-web:${identifier}`).digest('hex');
  return digest
    .slice(0, 16)
    .toUpperCase()
    .replace(/(.{4})(?!$)/g, '$1-');
}
