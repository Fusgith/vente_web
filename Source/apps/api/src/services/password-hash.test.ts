import { describe, expect, it } from 'vitest';

import { DUMMY_HASH, hashSecret, verifySecret } from './password-hash.js';

describe('password hashing (RG-USR-02: secrets stored as argon2id hashes)', () => {
  it('produces an argon2id hash with the chosen parameters', async () => {
    const stored = await hashSecret('1234');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(stored).not.toContain('1234');
    // A fresh salt every time: two hashes of the same secret differ.
    expect(await hashSecret('1234')).not.toBe(stored);
  });

  it('verifies the right secret and rejects the wrong one', async () => {
    const stored = await hashSecret('Boss-1234!');
    expect(await verifySecret(stored, 'Boss-1234!')).toBe(true);
    expect(await verifySecret(stored, 'Boss-1234?')).toBe(false);
    expect(await verifySecret(stored, '')).toBe(false);
  });

  it('never accepts a missing or malformed hash, without throwing', async () => {
    expect(await verifySecret(null, 'anything')).toBe(false);
    expect(await verifySecret('not-a-hash', 'anything')).toBe(false);
    expect(await verifySecret('', 'anything')).toBe(false);
  });

  it('keeps the dummy hash valid so unknown accounts cost one real verification', async () => {
    expect(DUMMY_HASH).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    // Whatever the dummy hashes, `verifySecret(null, …)` must stay false even on a match.
    expect(await verifySecret(null, 'dummy')).toBe(false);
  });
});
