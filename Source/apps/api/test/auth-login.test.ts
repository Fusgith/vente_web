import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generateTotpCode } from '../src/services/totp.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  auditEntries,
  createTestApp,
  createUser,
  login,
  pairStation,
  request,
  type TestApp,
} from './helpers.js';

const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe.skipIf(!TEST_DATABASE_URL)('POST /api/v1/auth/login', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'vola', roles: ['sales'], password: 'Shop-1234!' });
    await createUser(t.db, {
      username: 'boss',
      roles: ['owner'],
      password: 'Boss-1234!',
      totpSecret: TOTP_SECRET,
    });
  });

  it('opens the account’s role with identifier and password, sets an httpOnly cookie (H57, T5)', async () => {
    const { response, cookie, me } = await login(t.app, {
      username: 'vola',
      password: 'Shop-1234!',
    });

    expect(response.statusCode).toBe(200);
    expect(cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const set = response.cookies[0];
    expect(set).toMatchObject({ name: 'vw_session', httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(me.user).toMatchObject({ username: 'vola', roles: ['sales'], totpEnabled: false });
    expect(me.session).toMatchObject({
      activeRole: 'sales',
      origin: 'LAN',
      authMethod: 'PASSWORD',
    });
    expect(me.session.idleMinutes).toBe(15);

    const rows = await t.db.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(cookie);
    expect(await auditActions(t.db)).toEqual(['auth.login']);
  });

  it('asks for the TOTP code outside the shop before touching any account (RG-USR-04, T3)', async () => {
    const { response } = await login(t.app, {
      username: 'vola',
      password: 'Shop-1234!',
      origin: 'REMOTE',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: 'AUTH_TOTP_REQUIRED',
      message: expect.any(String),
    });
    expect(await auditActions(t.db)).toEqual([]);
  });

  it('takes no PIN and no role: the account opens its own (H57)', async () => {
    for (const extra of [{ pin: '1234' }, { role: 'sales' }]) {
      const response = await request(t.app, 'POST', '/api/v1/auth/login', {
        body: { username: 'vola', password: 'Shop-1234!', ...extra },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    }
  });

  it('keeps operational roles out of remote access, like a wrong password (T3)', async () => {
    const { response } = await login(t.app, {
      username: 'vola',
      password: 'Shop-1234!',
      totp: '000000',
      origin: 'REMOTE',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(await auditEntries(t.db)).toEqual([['auth.login_failed', 'role_remote_forbidden']]);
  });

  it('requires password + TOTP for a remote owner (RG-USR-04)', async () => {
    const without = await login(t.app, {
      username: 'boss',
      password: 'Boss-1234!',
      origin: 'REMOTE',
    });
    expect(without.response.statusCode).toBe(401);
    expect(without.response.json().code).toBe('AUTH_TOTP_REQUIRED');

    const code = generateTotpCode(TOTP_SECRET);
    const ok = await login(t.app, {
      username: 'boss',
      password: 'Boss-1234!',
      totp: code,
      origin: 'REMOTE',
    });
    expect(ok.response.statusCode).toBe(200);
    expect(ok.me.session).toMatchObject({
      origin: 'REMOTE',
      authMethod: 'PASSWORD_TOTP',
      idleMinutes: 60,
    });

    // A code is single-use (RFC 6238): the same one is a failure, counted like a wrong password.
    const replay = await login(t.app, {
      username: 'boss',
      password: 'Boss-1234!',
      totp: code,
      origin: 'REMOTE',
    });
    expect(replay.response.statusCode).toBe(401);
    expect(replay.response.json().code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(await auditActions(t.db)).toEqual(['auth.login', 'auth.login_failed']);
  });

  it('tells an owner without TOTP to enrol, in the shop only (no oracle outside)', async () => {
    const adm = await createUser(t.db, {
      username: 'adm',
      roles: ['admin'],
      password: 'Admin-1234!',
    });
    const body = {
      username: 'adm',
      password: 'Admin-1234!',
      totp: '000000',
    } as const;

    const remote = await login(t.app, { ...body, origin: 'REMOTE' });
    expect(remote.response.statusCode).toBe(401);
    expect(remote.response.json().code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(await auditActions(t.db, adm.id)).toEqual(['auth.login_failed']);

    // The password was right: the failure window restarts and the message can help.
    const local = await login(t.app, body);
    expect(local.response.statusCode).toBe(403);
    expect(local.response.json().code).toBe('AUTH_TOTP_NOT_ENROLLED');
    const user = await t.db.user.findUniqueOrThrow({ where: { id: adm.id } });
    expect(user.failedLoginCount).toBe(0);
    expect(await auditActions(t.db, adm.id)).toEqual(['auth.login_failed']);
  });

  it('answers the same 401 for a wrong secret, an unknown user, an inactive user', async () => {
    await createUser(t.db, {
      username: 'gone',
      roles: ['sales'],
      password: 'Shop-1234!',
      isActive: false,
    });
    const cases = [
      { username: 'vola', password: 'wrong' },
      { username: 'nobody', password: 'Shop-1234!' },
      { username: 'gone', password: 'Shop-1234!' },
    ] as const;
    for (const body of cases) {
      const { response } = await login(t.app, body);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: expect.any(String),
      });
    }
    // Unknown usernames are not audited (nothing to trace); the two others are, with why.
    const rows = await t.db.auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => [row.action, row.reason])).toEqual([
      ['auth.login_failed', 'invalid_secret'],
      ['auth.login_failed', 'inactive'],
    ]);
  });

  it('binds the session to a station, which picks the role among those held (H21, H57)', async () => {
    const register = await pairStation(t.db, 'REGISTER');
    const closed = await pairStation(t.db, 'SALES', false);
    await createUser(t.db, { username: 'soa', roles: ['cashier'], password: 'Shop-1234!' });
    await createUser(t.db, { username: 'chef', roles: ['manager'], password: 'Shop-1234!' });

    const wrongType = await login(t.app, {
      username: 'vola',
      password: 'Shop-1234!',
      stationKey: register.key,
    });
    expect(wrongType.response.statusCode).toBe(400);
    expect(wrongType.response.json().code).toBe('STATION_INVALID');

    const inactive = await login(t.app, {
      username: 'vola',
      password: 'Shop-1234!',
      stationKey: closed.key,
    });
    // A key of an inactive station pairs nothing: the device counts as unpaired (H71).
    expect(inactive.response.json().code).toBe('STATION_REQUIRED');

    const cashier = await login(t.app, {
      username: 'soa',
      password: 'Shop-1234!',
      stationKey: register.key,
    });
    expect(cashier.response.statusCode).toBe(200);
    expect(cashier.me.session.stationId).toBe(register.id);

    const manager = await login(t.app, {
      username: 'chef',
      password: 'Shop-1234!',
      stationKey: register.key,
    });
    expect(manager.response.statusCode).toBe(200);

    // Two roles held: the register opens the cashier one, not the first in the list.
    await createUser(t.db, {
      username: 'hery',
      roles: ['sales', 'cashier'],
      password: 'Shop-1234!',
    });
    const both = await login(t.app, {
      username: 'hery',
      password: 'Shop-1234!',
      stationKey: register.key,
    });
    expect(both.me.session.activeRole).toBe('cashier');
  });

  it('validates the body without echoing it', async () => {
    const response = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', pin: '12' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body)).not.toContain('"12"');
  });

  it('rejects a request the browser does not vouch for (CSRF, fail-closed)', async () => {
    const noHeader = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', password: 'Shop-1234!' },
      headers: { 'sec-fetch-site': undefined },
    });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json().code).toBe('CSRF_REJECTED');

    const crossSite = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', password: 'Shop-1234!' },
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    expect(crossSite.statusCode).toBe(403);

    // A browser that says nothing of the site: its Origin is then the proof.
    const sameHost = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', password: 'Shop-1234!' },
      headers: { 'sec-fetch-site': undefined, origin: 'http://localhost:80' },
    });
    expect(sameHost.statusCode).toBe(200);

    // Behind the proxy the scheme is X-Forwarded-Proto, believed from a trusted peer only (§2.2).
    const https = { 'sec-fetch-site': undefined, origin: 'https://localhost', host: 'localhost' };
    const proxied = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', password: 'Shop-1234!' },
      headers: { ...https, 'x-forwarded-proto': 'https' },
    });
    expect(proxied.statusCode).toBe(200);
    const plain = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', password: 'Shop-1234!' },
      headers: https,
    });
    expect(plain.json().code).toBe('CSRF_REJECTED');
    const spoofed = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', password: 'Shop-1234!' },
      headers: { ...https, 'x-forwarded-proto': 'https' },
      remoteAddress: '203.0.113.5',
    });
    expect(spoofed.json().code).toBe('CSRF_REJECTED');
  });

  it('treats an origin header from an untrusted peer as REMOTE (fail-closed, CDC technique 2.2)', async () => {
    const response = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', password: 'Shop-1234!' },
      headers: { 'x-access-origin': 'lan' },
      remoteAddress: '203.0.113.5',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_TOTP_REQUIRED');
  });

  it('throttles guesses per origin and address (10/min remotely)', async () => {
    // Outside the shop, each address has its own bucket of ten.
    const guess = () =>
      request(t.app, 'POST', '/api/v1/auth/login', {
        body: { username: 'nobody', password: 'x', totp: '000000' },
        origin: 'REMOTE',
        remoteAddress: '198.51.100.7',
      });
    for (let i = 0; i < 10; i += 1) expect((await guess()).statusCode).toBe(401);
    const throttled = await guess();
    expect(throttled.statusCode).toBe(429);
    expect(throttled.json()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: expect.any(Number) },
    });
    // Another address, and the LAN bucket, are separate: the shop keeps working.
    const other = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'nobody', password: 'x', totp: '000000' },
      origin: 'REMOTE',
      remoteAddress: '198.51.100.8',
    });
    expect(other.statusCode).toBe(401);
    const lan = await login(t.app, { username: 'vola', password: 'Shop-1234!' });
    expect(lan.response.statusCode).toBe(200);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('access origin as in production (no LAN default)', () => {
  it('is REMOTE when the proxy header is missing', async () => {
    const t = await createTestApp({ AUTH_DEFAULT_ORIGIN: 'REMOTE' });
    try {
      await t.reset();
      await createUser(t.db, { username: 'vola', roles: ['sales'], password: 'Shop-1234!' });
      const { response } = await login(t.app, { username: 'vola', password: 'Shop-1234!' });
      expect(response.json().code).toBe('AUTH_TOTP_REQUIRED');
      const lan = await login(t.app, {
        username: 'vola',
        password: 'Shop-1234!',
        origin: 'LAN',
      });
      expect(lan.response.statusCode).toBe(200);
    } finally {
      await t.close();
    }
  });
});
