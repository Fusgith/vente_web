import { hash, verify } from '@node-rs/argon2';

/**
 * Passwords are stored as argon2id hashes (RG-USR-03, CDC technique §8).
 * The only module touching the hashing library: swapping it (e.g. for Node's built-in
 * argon2 once the runtime target allows it) changes nothing elsewhere.
 * OWASP minimum parameters: 19 MiB, 2 iterations, 1 lane.
 */
// `Algorithm` is an ambient const enum, unreachable under `verbatimModuleSyntax`: Argon2id = 2.
const ARGON2_ID = 2;
const ARGON2_OPTIONS = {
  algorithm: ARGON2_ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash of a random value, verified when the account has no hash (unknown user, no password…) so
 * that every login path costs one argon2 verification — no timing oracle on account existence.
 */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$wy+Pd6eEffMZaxrSYdCSjw$rzcLOahJBSk7vkaX9KRSKm5XW5rotEHdhryI6CU/rwE';

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, ARGON2_OPTIONS);
}

/** False when `storedHash` is null (after a dummy verification) or malformed; never throws. */
export async function verifySecret(storedHash: string | null, secret: string): Promise<boolean> {
  try {
    const matches = await verify(storedHash ?? DUMMY_HASH, secret);
    return matches && storedHash !== null;
  } catch {
    return false;
  }
}
