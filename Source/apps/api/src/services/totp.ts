import { Secret, TOTP } from 'otpauth';

/** RFC 6238 parameters (RG-USR-04): 6 digits, 30 s steps, one step of tolerance each way. */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
const TOTP_ISSUER = 'Vente Web';

function totpFor(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label,
    secret: Secret.fromBase32(secretBase32),
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  });
}

/** 160-bit random secret, base32 as authenticator apps expect it. */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** `otpauth://` URI encoded in the enrolment QR code. */
export function totpUri(secretBase32: string, label: string): string {
  return totpFor(secretBase32, label).toString();
}

export function totpStep(timestampMs: number): number {
  return Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
}

export interface TotpCheck {
  /** Last time step already accepted for this secret: a code is single-use (RFC 6238 §5.2). */
  lastStep: number | null;
  now?: number;
}

/**
 * Validates a code and returns the time step it belongs to, or null when it is wrong,
 * outside the window, or a replay (step not after `lastStep`).
 */
export function verifyTotp(secretBase32: string, code: string, check: TotpCheck): number | null {
  const now = check.now ?? Date.now();
  const delta = totpFor(secretBase32, 'verify').validate({
    token: code,
    timestamp: now,
    window: TOTP_WINDOW,
  });
  if (delta === null) return null;
  const step = totpStep(now) + delta;
  if (check.lastStep !== null && step <= check.lastStep) return null;
  return step;
}

/** Test helper and seed support: the code valid at `timestampMs`. */
export function generateTotpCode(secretBase32: string, timestampMs = Date.now()): string {
  return totpFor(secretBase32, 'generate').generate({ timestamp: timestampMs });
}
