import { describe, expect, it } from 'vitest';

import {
  TOTP_PERIOD_SECONDS,
  generateTotpCode,
  generateTotpSecret,
  totpStep,
  totpUri,
  verifyTotp,
} from './totp.js';

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
// A fixed instant, so the tests do not depend on the wall clock.
const NOW = Date.UTC(2026, 8, 22, 10, 0, 0);
const STEP_MS = TOTP_PERIOD_SECONDS * 1000;

describe('TOTP (RG-USR-04: 6 digits, 30 s, one step of tolerance, single use)', () => {
  it('generates a 160-bit base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('accepts the current code and returns its time step', () => {
    const code = generateTotpCode(SECRET, NOW);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(SECRET, code, { lastStep: null, now: NOW })).toBe(totpStep(NOW));
  });

  it('tolerates one step each way, not two (clock drift)', () => {
    const step = totpStep(NOW);
    expect(
      verifyTotp(SECRET, generateTotpCode(SECRET, NOW - STEP_MS), { lastStep: null, now: NOW }),
    ).toBe(step - 1);
    expect(
      verifyTotp(SECRET, generateTotpCode(SECRET, NOW + STEP_MS), { lastStep: null, now: NOW }),
    ).toBe(step + 1);
    expect(
      verifyTotp(SECRET, generateTotpCode(SECRET, NOW - 2 * STEP_MS), { lastStep: null, now: NOW }),
    ).toBeNull();
    expect(
      verifyTotp(SECRET, generateTotpCode(SECRET, NOW + 2 * STEP_MS), { lastStep: null, now: NOW }),
    ).toBeNull();
  });

  it('refuses a replayed code, or an older step once a newer one was used', () => {
    const step = totpStep(NOW);
    const code = generateTotpCode(SECRET, NOW);
    expect(verifyTotp(SECRET, code, { lastStep: step, now: NOW })).toBeNull();
    const previous = generateTotpCode(SECRET, NOW - STEP_MS);
    expect(verifyTotp(SECRET, previous, { lastStep: step, now: NOW })).toBeNull();
    // The next step is still fine after the current one was spent.
    const next = generateTotpCode(SECRET, NOW + STEP_MS);
    expect(verifyTotp(SECRET, next, { lastStep: step, now: NOW })).toBe(step + 1);
  });

  it('rejects a wrong or malformed code, and a code for another secret', () => {
    expect(verifyTotp(SECRET, '000000', { lastStep: null, now: NOW })).toBeNull();
    expect(verifyTotp(SECRET, '12345', { lastStep: null, now: NOW })).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', { lastStep: null, now: NOW })).toBeNull();
    const other = generateTotpSecret();
    expect(
      verifyTotp(other, generateTotpCode(SECRET, NOW), { lastStep: null, now: NOW }),
    ).toBeNull();
  });

  it('builds the enrolment URI with issuer, label and parameters', () => {
    const uri = totpUri(SECRET, 'boss', 'Vente Web');
    expect(uri).toMatch(/^otpauth:\/\/totp\/Vente%20Web:boss\?/);
    expect(uri).toContain(`secret=${SECRET}`);
    expect(uri).toContain('issuer=Vente%20Web');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('names the account after the application (RG-APP-01)', () => {
    const uri = totpUri(SECRET, 'boss', 'Épicerie Rasoa');
    expect(uri).toMatch(/^otpauth:\/\/totp\/%C3%89picerie%20Rasoa:boss\?/);
    expect(uri).toContain('issuer=%C3%89picerie%20Rasoa');
  });
});
