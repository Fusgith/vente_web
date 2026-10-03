import { createECDH } from 'node:crypto';

/**
 * The server's identity before the browsers' push services (VAPID, RFC 8292): a P-256 key pair,
 * printed by `web-push generate-vapid-keys`, and a contact the services may write to.
 */
export interface Vapid {
  publicKey: string;
  privateKey: string;
  /** `mailto:` or `https:` (RFC 8292 §2.1). */
  subject: string;
}

export interface VapidVars {
  VAPID_PUBLIC_KEY?: string | undefined;
  VAPID_PRIVATE_KEY?: string | undefined;
  VAPID_SUBJECT?: string | undefined;
}

export interface VapidProblem {
  variable: keyof VapidVars;
  message: string;
}

const VARIABLES = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
/** Unpadded base64url: an uncompressed P-256 point is 65 bytes, its private key 32. */
const PUBLIC_KEY = /^[A-Za-z0-9_-]{87}$/;
const PRIVATE_KEY = /^[A-Za-z0-9_-]{43}$/;

/** The public key of a private one; null when it is no P-256 private key. */
function publicKeyOf(privateKey: string): string | null {
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    return ecdh.getPublicKey().toString('base64url');
  } catch {
    return null;
  }
}

/** Apple refuses a `localhost` contact (BadJwtToken): the owner on an iPhone would get nothing. */
function isSubject(subject: string): boolean {
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(subject)) return true;
  try {
    const url = new URL(subject);
    return url.protocol === 'https:' && !/(^|\.)localhost$/.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Why the VAPID variables cannot be used: all three or none (push off), each well formed, and
 * the public key the private one's — a pair mixed up at install is refused at start, not at the
 * first request.
 */
export function vapidProblems(vars: VapidVars): VapidProblem[] {
  const missing = VARIABLES.filter((variable) => vars[variable] === undefined);
  if (missing.length === VARIABLES.length) return [];
  if (missing.length > 0) {
    return missing.map((variable) => ({
      variable,
      message: 'must be set with the other VAPID variables, or none of them (push off)',
    }));
  }
  const problems: VapidProblem[] = [];
  const publicKey = vars.VAPID_PUBLIC_KEY ?? '';
  const privateKey = vars.VAPID_PRIVATE_KEY ?? '';
  if (!PUBLIC_KEY.test(publicKey)) {
    problems.push({ variable: 'VAPID_PUBLIC_KEY', message: 'must be 65 bytes in base64url' });
  }
  if (!PRIVATE_KEY.test(privateKey)) {
    problems.push({ variable: 'VAPID_PRIVATE_KEY', message: 'must be 32 bytes in base64url' });
  } else if (PUBLIC_KEY.test(publicKey) && publicKeyOf(privateKey) !== publicKey) {
    problems.push({
      variable: 'VAPID_PUBLIC_KEY',
      message: 'is not the public key of VAPID_PRIVATE_KEY',
    });
  }
  if (!isSubject(vars.VAPID_SUBJECT ?? '')) {
    problems.push({
      variable: 'VAPID_SUBJECT',
      message: 'must be a mailto: or https: address, not localhost',
    });
  }
  return problems;
}

/** The VAPID details, once validated; null: push is off. */
export function vapidOf(vars: VapidVars): Vapid | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = vars;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return null;
  return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT };
}
