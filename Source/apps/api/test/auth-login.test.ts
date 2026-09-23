import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generateTotpCode } from '../src/services/totp.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createStation,
  createTestApp,
  createUser,
  login,
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
    await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234' });
    await createUser(t.db, {
      username: 'boss',
      roles: ['owner'],
      password: 'Boss-1234!',
      totpSecret: TOTP_SECRET,
    });
  });

  it('opens a PIN session in the shop and sets an httpOnly cookie (RG-USR-03, T5)', async () => {
    const { response, cookie, me } = await login(t.app, {
      username: 'vola',
      role: 'sales',
      pin: '1234',
    });

    expect(response.statusCode).toBe(200);
    expect(cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const set = response.cookies[0];
    expect(set).toMatchObject({ name: 'vw_session', httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(me.user).toMatchObject({ username: 'vola', roles: ['sales'], totpEnabled: false });
    expect(me.session).toMatchObject({ activeRole: 'sales', origin: 'LAN', authMethod: 'PIN' });
    expect(me.session.idleMinutes).toBe(15);

    const rows = await t.db.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toContain(cookie);
    expect(await auditActions(t.db)).toEqual(['auth.login']);
  });

  it('refuses a PIN from outside the shop before touching the account (RG-USR-03, T3)', async () => {
    const { response } = await login(t.app, {
      username: 'vola',
      role: 'sales',
      pin: '1234',
      origin: 'REMOTE',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'AUTH_PIN_LAN_ONLY',
      message: expect.any(String),
    });
    expect(await auditActions(t.db)).toEqual([]);
  });

  it('refuses a PIN for owner/admin even in the shop', async () => {
    await createUser(t.db, { username: 'adm', roles: ['admin'], pin: '1234' });
    const { response } = await login(t.app, { username: 'adm', role: 'admin', pin: '1234' });
    expect(response.json().code).toBe('AUTH_PIN_LAN_ONLY');
  });

  it('keeps operational roles out of remote access (T3)', async () => {
    const { response } = await login(t.app, {
      username: 'vola',
      role: 'sales',
      password: 'x',
      totp: '000000',
      origin: 'REMOTE',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('AUTH_ROLE_REMOTE_FORBIDDEN');
  });

  it('requires password + TOTP for a remote owner (RG-USR-04)', async () => {
    const without = await login(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
      origin: 'REMOTE',
    });
    expect(without.response.statusCode).toBe(401);
    expect(without.response.json().code).toBe('AUTH_TOTP_REQUIRED');

    const code = generateTotpCode(TOTP_SECRET);
    const ok = await login(t.app, {
      username: 'boss',
      role: 'owner',
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
      role: 'owner',
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
      role: 'admin',
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

  it('answers the same 401 for a wrong secret, an unknown user, an inactive user, a role not held', async () => {
    await createUser(t.db, { username: 'gone', roles: ['sales'], pin: '1234', isActive: false });
    const cases = [
      { username: 'vola', role: 'sales', pin: '9999' },
      { username: 'nobody', role: 'sales', pin: '1234' },
      { username: 'gone', role: 'sales', pin: '1234' },
      { username: 'vola', role: 'cashier', pin: '1234' },
    ] as const;
    for (const body of cases) {
      const { response } = await login(t.app, body);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: expect.any(String),
      });
    }
    // Unknown usernames are not audited (nothing to trace); the three others are, with why.
    const rows = await t.db.auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => [row.action, row.reason])).toEqual([
      ['auth.login_failed', 'invalid_secret'],
      ['auth.login_failed', 'inactive'],
      ['auth.login_failed', 'role_not_held'],
    ]);
  });

  it('binds the session to a station of the right type (H21)', async () => {
    const register = await createStation(t.db, 'REGISTER');
    const closed = await createStation(t.db, 'SALES', false);
    await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '1234' });
    await createUser(t.db, { username: 'chef', roles: ['manager'], pin: '1234' });

    const wrongType = await login(t.app, {
      username: 'vola',
      role: 'sales',
      pin: '1234',
      stationId: register.id,
    });
    expect(wrongType.response.statusCode).toBe(400);
    expect(wrongType.response.json().code).toBe('STATION_INVALID');

    const inactive = await login(t.app, {
      username: 'vola',
      role: 'sales',
      pin: '1234',
      stationId: closed.id,
    });
    expect(inactive.response.json().code).toBe('STATION_INVALID');

    const cashier = await login(t.app, {
      username: 'soa',
      role: 'cashier',
      pin: '1234',
      stationId: register.id,
    });
    expect(cashier.response.statusCode).toBe(200);
    expect(cashier.me.session.stationId).toBe(register.id);

    const manager = await login(t.app, {
      username: 'chef',
      role: 'manager',
      pin: '1234',
      stationId: register.id,
    });
    expect(manager.response.statusCode).toBe(200);
  });

  it('validates the body without echoing it', async () => {
    const response = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '12' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body)).not.toContain('"12"');
  });

  it('rejects a request the browser does not vouch for (CSRF, fail-closed)', async () => {
    const noHeader = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '1234' },
      headers: { 'sec-fetch-site': undefined },
    });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json().code).toBe('CSRF_REJECTED');

    const crossSite = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '1234' },
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
    });
    expect(crossSite.statusCode).toBe(403);

    // A browser that says nothing of the site: its Origin is then the proof.
    const sameHost = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '1234' },
      headers: { 'sec-fetch-site': undefined, origin: 'http://localhost:80' },
    });
    expect(sameHost.statusCode).toBe(200);

    // Behind the proxy the scheme is X-Forwarded-Proto, believed from a trusted peer only (§2.2).
    const https = { 'sec-fetch-site': undefined, origin: 'https://localhost', host: 'localhost' };
    const proxied = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '1234' },
      headers: { ...https, 'x-forwarded-proto': 'https' },
    });
    expect(proxied.statusCode).toBe(200);
    const plain = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '1234' },
      headers: https,
    });
    expect(plain.json().code).toBe('CSRF_REJECTED');
    const spoofed = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '1234' },
      headers: { ...https, 'x-forwarded-proto': 'https' },
      remoteAddress: '203.0.113.5',
    });
    expect(spoofed.json().code).toBe('CSRF_REJECTED');
  });

  it('treats an origin header from an untrusted peer as REMOTE (fail-closed, CDC technique 2.2)', async () => {
    const response = await request(t.app, 'POST', '/api/v1/auth/login', {
      body: { username: 'vola', role: 'sales', pin: '1234' },
      headers: { 'x-access-origin': 'lan' },
      remoteAddress: '203.0.113.5',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('AUTH_PIN_LAN_ONLY');
  });

  it('throttles guesses per origin and address (10/min remotely)', async () => {
    // Outside the shop, each address has its own bucket of ten.
    const guess = () =>
      request(t.app, 'POST', '/api/v1/auth/login', {
        body: { username: 'nobody', role: 'owner', password: 'x', totp: '000000' },
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
      body: { username: 'nobody', role: 'owner', password: 'x', totp: '000000' },
      origin: 'REMOTE',
      remoteAddress: '198.51.100.8',
    });
    expect(other.statusCode).toBe(401);
    const lan = await login(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    expect(lan.response.statusCode).toBe(200);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('access origin as in production (no LAN default)', () => {
  it('is REMOTE when the proxy header is missing', async () => {
    const t = await createTestApp({ AUTH_DEFAULT_ORIGIN: 'REMOTE' });
    try {
      await t.reset();
      await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234' });
      const { response } = await login(t.app, { username: 'vola', role: 'sales', pin: '1234' });
      expect(response.json().code).toBe('AUTH_PIN_LAN_ONLY');
      const lan = await login(t.app, {
        username: 'vola',
        role: 'sales',
        pin: '1234',
        origin: 'LAN',
      });
      expect(lan.response.statusCode).toBe(200);
    } finally {
      await t.close();
    }
  });
});
