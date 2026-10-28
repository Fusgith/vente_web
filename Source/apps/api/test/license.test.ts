import { generateKeyPairSync, sign } from 'node:crypto';

import { MACHINE_CODE_PATTERN } from '@vente-web/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { machineCode } from '../src/services/license.js';
import { TEST_DATABASE_URL } from './db.js';
import { createTestApp, request, type TestApp } from './helpers.js';

const vendor = generateKeyPairSync('ed25519');
const PUBLIC_KEY = vendor.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const MACHINE = 'ABCD-0123-4567-89EF';
const DAY = 24 * 60 * 60 * 1000;

function licenseKey(
  terms: { client?: string; machine?: string; expires: string | null },
  privateKey = vendor.privateKey,
): string {
  const payload = Buffer.from(
    JSON.stringify({ client: 'Épicerie Rasoa', machine: MACHINE, ...terms }),
  ).toString('base64url');
  return `${payload}.${sign(null, Buffer.from(payload), privateKey).toString('base64url')}`;
}

describe('machineCode (T-101)', () => {
  it('turns an identifier into four groups of hex digits, always the same', () => {
    expect(machineCode('3f2c-guid')).toMatch(MACHINE_CODE_PATTERN);
    expect(machineCode('3f2c-guid')).toBe(machineCode('3f2c-guid'));
    expect(machineCode('another-guid')).not.toBe(machineCode('3f2c-guid'));
  });
});

describe.skipIf(!TEST_DATABASE_URL)('trial license (T-101, ADR-0010)', () => {
  let t: TestApp;
  let now: Date;
  const START = new Date('2026-11-01T08:00:00+03:00');
  const later = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  const enter = (key: string) => request(t.app, 'POST', '/api/v1/license', { body: { key } });

  beforeEach(async () => {
    now = START;
    t = await createTestApp(
      {},
      { license: { publicKey: PUBLIC_KEY, machine: MACHINE, now: () => now } },
    );
    await t.reset();
  });
  afterEach(() => t.close());

  it('locks the API but the lock screen and the probe until a key is entered', async () => {
    const status = await request(t.app, 'GET', '/api/v1/license');
    expect(status.json()).toEqual({
      state: 'missing',
      machine: MACHINE,
      client: null,
      expires: null,
    });

    const me = await request(t.app, 'GET', '/api/v1/auth/me');
    expect(me.statusCode).toBe(403);
    expect(me.json()).toMatchObject({ code: 'LICENSE_REQUIRED' });
    expect((await request(t.app, 'GET', '/healthz')).statusCode).toBe(200);
  });

  it('refuses a forged key, a key for another server and an expired one', async () => {
    const thief = generateKeyPairSync('ed25519');
    const forged = await enter(licenseKey({ expires: null }, thief.privateKey));
    expect(forged.json()).toMatchObject({ code: 'LICENSE_KEY_INVALID' });
    expect((await enter('pas-une-cle')).json()).toMatchObject({ code: 'LICENSE_KEY_INVALID' });

    const elsewhere = await enter(licenseKey({ machine: 'FFFF-FFFF-FFFF-FFFF', expires: null }));
    expect(elsewhere.statusCode).toBe(422);
    expect(elsewhere.json()).toMatchObject({ code: 'LICENSE_KEY_OTHER_MACHINE' });

    const old = await enter(licenseKey({ expires: '2026-10-31T23:59:59+03:00' }));
    expect(old.json()).toMatchObject({ code: 'LICENSE_KEY_EXPIRED' });
    expect((await request(t.app, 'GET', '/api/v1/auth/me')).statusCode).toBe(403);
  });

  it('opens the application until the end of the trial, then locks it again', async () => {
    const expires = '2026-11-30T23:59:59+03:00';
    const entered = await enter(licenseKey({ expires }));
    expect(entered.json()).toEqual({
      state: 'valid',
      machine: MACHINE,
      client: 'Épicerie Rasoa',
      expires,
    });
    // Not locked any more: the session check answers.
    expect((await request(t.app, 'GET', '/api/v1/auth/me')).statusCode).toBe(401);

    now = new Date('2026-12-01T00:00:01+03:00');
    expect((await request(t.app, 'GET', '/api/v1/license')).json()).toMatchObject({
      state: 'expired',
    });
    expect((await request(t.app, 'GET', '/api/v1/auth/me')).statusCode).toBe(403);

    // A new key from the vendor opens it again.
    await enter(licenseKey({ expires: null }));
    expect((await request(t.app, 'GET', '/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('locks a server whose clock was turned back, until it is set right', async () => {
    await enter(licenseKey({ expires: '2026-11-30T23:59:59+03:00' }));
    later(20 * DAY);
    await request(t.app, 'GET', '/api/v1/license');

    now = START;
    expect((await request(t.app, 'GET', '/api/v1/license')).json()).toMatchObject({
      state: 'clock',
    });
    expect((await request(t.app, 'GET', '/api/v1/auth/me')).statusCode).toBe(403);

    later(20 * DAY + 60_000);
    expect((await request(t.app, 'GET', '/api/v1/license')).json()).toMatchObject({
      state: 'valid',
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('without a vendor key (development)', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(() => t.close());

  it('answers unchecked and locks nothing', async () => {
    expect((await request(t.app, 'GET', '/api/v1/license')).json()).toEqual({
      state: 'unchecked',
      machine: null,
      client: null,
      expires: null,
    });
    expect((await request(t.app, 'GET', '/api/v1/auth/me')).statusCode).toBe(401);
  });
});
