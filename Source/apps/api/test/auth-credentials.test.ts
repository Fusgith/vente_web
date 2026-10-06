import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generateTotpCode } from '../src/services/totp.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  login,
  loginOk,
  request,
  sessionCookie,
  type TestApp,
} from './helpers.js';

const ME = '/api/v1/auth/me';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe.skipIf(!TEST_DATABASE_URL)('self-service credentials (H20)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234' });
    await createUser(t.db, { username: 'boss', roles: ['owner'], password: 'Boss-1234!' });
  });

  it('changes the PIN with the current one, keeps the session, audits no secret', async () => {
    // The PIN no longer opens a session (H57); it stays for the manager's approval until T-017d.
    const { cookie } = await loginOk(t.app, { username: 'vola', pin: '1234' });
    const before = await t.db.user.findUniqueOrThrow({ where: { username: 'vola' } });

    const response = await request(t.app, 'PUT', '/api/v1/auth/pin', {
      cookie,
      body: { current: '1234', pin: '5678' },
    });
    expect(response.statusCode).toBe(204);

    expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(200);
    const after = await t.db.user.findUniqueOrThrow({ where: { username: 'vola' } });
    expect(after.pinHash).not.toBe(before.pinHash);
    expect(after.passwordHash).toBe(before.passwordHash);

    const rows = await t.db.auditLog.findMany({ where: { action: 'user.pin_set' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ before: { hasPin: true }, after: { hasPin: true } });
    expect(JSON.stringify(rows)).not.toMatch(/1234|5678/);
  });

  it('counts a wrong current secret as a login failure (RG-USR-05)', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const response = await request(t.app, 'PUT', '/api/v1/auth/pin', {
      cookie,
      body: { current: '0000', pin: '5678' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(await auditActions(t.db)).toEqual(['auth.login', 'auth.login_failed']);
    const user = await t.db.user.findUniqueOrThrow({ where: { username: 'vola' } });
    expect(user.failedLoginCount).toBe(1);
  });

  it('refuses a PIN on an account without operational role', async () => {
    const { cookie } = await loginOk(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
    });
    const response = await request(t.app, 'PUT', '/api/v1/auth/pin', {
      cookie,
      body: { current: 'Boss-1234!', pin: '5678' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('PIN_REQUIRES_OPERATIONAL_ROLE');
  });

  it('changes the password and enforces its length', async () => {
    const { cookie } = await loginOk(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
    });
    const short = await request(t.app, 'PUT', '/api/v1/auth/password', {
      cookie,
      body: { current: 'Boss-1234!', password: 'short' },
    });
    expect(short.statusCode).toBe(400);
    expect(short.json().code).toBe('VALIDATION_ERROR');

    const response = await request(t.app, 'PUT', '/api/v1/auth/password', {
      cookie,
      body: { current: 'Boss-1234!', password: 'New-Boss-5678!' },
    });
    expect(response.statusCode).toBe(204);
    expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(200);
    const relogin = await login(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'New-Boss-5678!',
    });
    expect(relogin.response.statusCode).toBe(200);

    const rows = await t.db.auditLog.findMany({ where: { action: 'user.password_set' } });
    expect(rows[0]).toMatchObject({ before: { hasPassword: true }, after: { hasPassword: true } });
    expect(JSON.stringify(rows)).not.toMatch(/1234|5678/);
  });

  it('enrols TOTP from the shop with a password session, then unlocks remote access', async () => {
    const { cookie } = await loginOk(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
    });

    const notPending = await request(t.app, 'POST', '/api/v1/auth/totp/confirm', {
      cookie,
      body: { code: '000000' },
    });
    expect(notPending.statusCode).toBe(400);
    expect(notPending.json().code).toBe('AUTH_TOTP_NOT_PENDING');

    const start = await request(t.app, 'POST', '/api/v1/auth/totp', { cookie });
    expect(start.statusCode).toBe(200);
    const { uri, secret } = start.json();
    expect(uri).toMatch(/^otpauth:\/\/totp\/Vente%20Web:boss\?/);
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect((await request(t.app, 'GET', ME, { cookie })).json().user.totpEnabled).toBe(false);

    const wrong = await request(t.app, 'POST', '/api/v1/auth/totp/confirm', {
      cookie,
      body: { code: '000000' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().code).toBe('AUTH_TOTP_INVALID');

    const now = Date.now();
    const confirm = await request(t.app, 'POST', '/api/v1/auth/totp/confirm', {
      cookie,
      body: { code: generateTotpCode(secret, now) },
    });
    expect(confirm.statusCode).toBe(204);
    expect((await request(t.app, 'GET', ME, { cookie })).json().user.totpEnabled).toBe(true);

    // The confirmation code is spent; the next step is accepted (one step of tolerance).
    const remote = await login(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
      totp: generateTotpCode(secret, now + 30_000),
      origin: 'REMOTE',
    });
    expect(remote.response.statusCode).toBe(200);
    expect(await auditActions(t.db)).toEqual([
      'auth.login',
      'user.totp_enrolled',
      'auth.login_failed',
      'user.totp_enabled',
      // One session per person (RG-USR-09): the remote login closes the shop one.
      'auth.session_replaced',
      'auth.login',
    ]);
  });

  it('refuses enrolment from outside, or without the current code once enabled', async () => {
    const secret = TOTP_SECRET;
    await createUser(t.db, {
      username: 'adm',
      roles: ['admin'],
      password: 'Admin-1234!',
      totpSecret: secret,
    });
    const remote = await loginOk(t.app, {
      username: 'adm',
      role: 'admin',
      password: 'Admin-1234!',
      totp: generateTotpCode(secret),
      origin: 'REMOTE',
    });
    const fromOutside = await request(t.app, 'POST', '/api/v1/auth/totp', {
      cookie: remote.cookie,
      origin: 'REMOTE',
    });
    expect(fromOutside.statusCode).toBe(403);
    expect(fromOutside.json().code).toBe('AUTH_LAN_ONLY');

    const local = await loginOk(t.app, { username: 'adm', role: 'admin', password: 'Admin-1234!' });
    const noCode = await request(t.app, 'POST', '/api/v1/auth/totp', { cookie: local.cookie });
    expect(noCode.statusCode).toBe(401);
    expect(noCode.json().code).toBe('AUTH_TOTP_REQUIRED');

    const next = Date.now() + 30_000;
    const withCode = await request(t.app, 'POST', '/api/v1/auth/totp', {
      cookie: local.cookie,
      body: { code: generateTotpCode(secret, next) },
    });
    expect(withCode.statusCode).toBe(200);
    const user = await t.db.user.findUniqueOrThrow({ where: { username: 'adm' } });
    expect(user.totpSecret).toBe(secret);
    expect(user.totpPendingSecret).toBe(withCode.json().secret);

    // The step just spent on the old secret is not spent on the new one: same instant, new code.
    const confirm = await request(t.app, 'POST', '/api/v1/auth/totp/confirm', {
      cookie: local.cookie,
      body: { code: generateTotpCode(withCode.json().secret, next) },
    });
    expect(confirm.statusCode).toBe(204);
    const enabled = await t.db.user.findUniqueOrThrow({ where: { username: 'adm' } });
    expect(enabled.totpSecret).toBe(withCode.json().secret);
    expect(enabled.totpPendingSecret).toBeNull();
    // The shop session goes on; the remote one ended when it opened (RG-USR-09).
    const stale = await request(t.app, 'GET', ME, { cookie: remote.cookie, origin: 'REMOTE' });
    expect(stale.statusCode).toBe(401);
    expect((await request(t.app, 'GET', ME, { cookie: local.cookie })).statusCode).toBe(200);
    expect(await auditActions(t.db)).toContain('auth.session_replaced');
  });

  it('confirms an enrolment from the shop only, like its start (H20)', async () => {
    const pending = 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU';
    await createUser(t.db, {
      username: 'adm',
      roles: ['admin'],
      password: 'Admin-1234!',
      totpSecret: TOTP_SECRET,
    });
    await t.db.user.update({ where: { username: 'adm' }, data: { totpPendingSecret: pending } });
    const remote = await loginOk(t.app, {
      username: 'adm',
      role: 'admin',
      password: 'Admin-1234!',
      totp: generateTotpCode(TOTP_SECRET),
      origin: 'REMOTE',
    });

    const response = await request(t.app, 'POST', '/api/v1/auth/totp/confirm', {
      cookie: remote.cookie,
      origin: 'REMOTE',
      body: { code: generateTotpCode(pending) },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('AUTH_LAN_ONLY');
    const user = await t.db.user.findUniqueOrThrow({ where: { username: 'adm' } });
    expect(user).toMatchObject({ totpSecret: TOTP_SECRET, totpPendingSecret: pending });
  });

  it('spends a TOTP code exactly once, whatever the race (RG-USR-04)', async () => {
    await createUser(t.db, {
      username: 'adm',
      roles: ['admin'],
      password: 'Admin-1234!',
      totpSecret: TOTP_SECRET,
    });
    const body = {
      username: 'adm',
      role: 'admin',
      password: 'Admin-1234!',
      totp: generateTotpCode(TOTP_SECRET),
      origin: 'REMOTE',
    } as const;
    const results = await Promise.all(Array.from({ length: 3 }, () => login(t.app, body)));
    const statuses = results.map((r) => r.response.statusCode).sort();
    expect(statuses).toEqual([200, 401, 401]);
    const actions = await auditActions(t.db);
    expect(actions.filter((a) => a === 'auth.login')).toHaveLength(1);
    expect(actions.filter((a) => a === 'auth.login_failed')).toHaveLength(2);
  });

  it('throttles the routes that take a secret or a code, like the login (10/min remotely)', async () => {
    await createUser(t.db, {
      username: 'adm',
      roles: ['admin'],
      password: 'Admin-1234!',
      totpSecret: TOTP_SECRET,
    });
    const remote = { origin: 'REMOTE', remoteAddress: '198.51.100.9' } as const;
    const opened = await request(t.app, 'POST', '/api/v1/auth/login', {
      ...remote,
      body: {
        username: 'adm',
        password: 'Admin-1234!',
        totp: generateTotpCode(TOTP_SECRET),
      },
    });
    expect(opened.statusCode).toBe(200);
    const cookie = sessionCookie(opened) ?? '';

    const routes: [string, 'PUT' | 'POST', unknown, number[]][] = [
      // Wrong current password: five guesses, then the lock, then the throttle.
      [
        '/api/v1/auth/password',
        'PUT',
        { current: 'nope', password: 'New-Admin-5678!' },
        [401, 423],
      ],
      ['/api/v1/auth/pin', 'PUT', { current: 'nope', pin: '5678' }, [400]],
      ['/api/v1/auth/totp', 'POST', {}, [403]],
      ['/api/v1/auth/totp/confirm', 'POST', { code: '000000' }, [403]],
    ];
    for (const [url, method, body, accepted] of routes) {
      for (let i = 0; i < 10; i += 1) {
        const response = await request(t.app, method, url, { ...remote, cookie, body });
        expect(accepted, `${url} #${i}`).toContain(response.statusCode);
      }
      const throttled = await request(t.app, method, url, { ...remote, cookie, body });
      expect(throttled.statusCode, url).toBe(429);
      expect(throttled.json().code).toBe('RATE_LIMITED');
    }
  });
});
