import { z } from 'zod';

/** A server's code, which the vendor writes into its key: 16 hex digits in four groups (ADR-0010). */
export const MACHINE_CODE_PATTERN = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;

/** The login screen announces the end of a trial this many days ahead (H82). */
export const LICENSE_NOTICE_DAYS = 7;

/**
 * Where the shop's server stands (ADR-0010): `unchecked` when no vendor key is built in
 * (development), `valid`, or why the application is locked.
 */
export const licenseStateSchema = z.enum([
  'unchecked',
  'valid',
  'missing',
  'invalid',
  'other-machine',
  'expired',
  'clock',
]);
export type LicenseState = z.infer<typeof licenseStateSchema>;

export const licenseStatusSchema = z.object({
  state: licenseStateSchema,
  /** This server's code; null when unchecked. */
  machine: z.string().nullable(),
  /** The shop the key was made for, when the key could be read. */
  client: z.string().nullable(),
  /** End of the trial (ISO instant); null: no end, or no key. */
  expires: z.string().nullable(),
});
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;

export const licenseKeyInputSchema = z.object({ key: z.string().trim().min(1).max(4000) });
