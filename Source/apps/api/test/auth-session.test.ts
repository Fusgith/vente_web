import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  auditEntries,
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  sessionCookie,
  type TestApp,
} from './helpers.js';

const ME = '/api/v1/auth/me';
const MINUTE = 60_000;

describe.skipIf(!TEST_DATABASE_URL)('sessions (/auth/me, logout, expiry, origin)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'vola', roles: ['sales', 'cashier'], pin: '1234' });
  });

  it('needs a cookie, and clears an unknown one', async () => {
    const anonymous = await request(t.app, 'GET', ME);
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().code).toBe('AUTH_REQUIRED');

    const bogus = await request(t.app, 'GET', ME, { cookie: 'not-a-token' });
    expect(bogus.statusCode).toBe(401);
    expect(bogus.cookies[0]).toMatchObject({ name: 'vw_session', value: '' });
  });

  it('logs out: the row is deleted, the cookie cleared, the logout audited (RG-AUD-02)', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });

    const logout = await request(t.app, 'POST', '/api/v1/auth/logout', { cookie });
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies[0]).toMatchObject({ name: 'vw_session', value: '' });
    expect(await t.db.session.count()).toBe(0);

    const after = await request(t.app, 'GET', ME, { cookie });
    expect(after.statusCode).toBe(401);
    expect(await auditActions(t.db)).toEqual(['auth.login', 'auth.logout']);
  });

  it('audits a double logout once (RG-AUD-01)', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const logout = () => request(t.app, 'POST', '/api/v1/auth/logout', { cookie });

    await Promise.all([logout(), logout()]);
    expect(await t.db.session.count()).toBe(0);
    expect(await auditActions(t.db)).toEqual(['auth.login', 'auth.logout']);
  });

  it('keeps one session per person: a new login closes the previous one (RG-USR-09)', async () => {
    const first = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const second = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });

    expect((await request(t.app, 'GET', ME, { cookie: first.cookie })).statusCode).toBe(401);
    expect((await request(t.app, 'GET', ME, { cookie: second.cookie })).statusCode).toBe(200);
    expect(await t.db.session.count()).toBe(1);
    expect(await auditEntries(t.db)).toEqual([
      ['auth.login', null],
      ['auth.session_replaced', 'new_login'],
      ['auth.login', null],
    ]);
  });

  it('leaves a single session when two logins of one person race (RG-USR-09)', async () => {
    const logins = await Promise.all(
      [1, 2, 3].map(() => loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' })),
    );
    expect(await t.db.session.count()).toBe(1);
    const alive = await Promise.all(
      logins.map(async ({ cookie }) => (await request(t.app, 'GET', ME, { cookie })).statusCode),
    );
    expect(alive.filter((status) => status === 200)).toHaveLength(1);
  });

  it('logs out everywhere', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });

    const response = await request(t.app, 'POST', '/api/v1/auth/logout-all', { cookie });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: 1 });
    expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(401);
    expect(await auditActions(t.db)).toContain('auth.logout_all');
  });

  it('ends a session past its absolute lifetime and audits it (H19, RG-AUD-01)', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    await t.db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await request(t.app, 'GET', ME, { cookie });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_SESSION_EXPIRED');
    expect(await t.db.session.count()).toBe(0);
    expect(await auditEntries(t.db)).toEqual([
      ['auth.login', null],
      ['auth.session_expired', 'absolute'],
    ]);
  });

  it('audits the expired sessions a new login sweeps away (H19, RG-AUD-01)', async () => {
    await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const expired = await t.db.session.findFirstOrThrow();
    await t.db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    expect(await t.db.session.count()).toBe(1);
    expect(await auditEntries(t.db)).toEqual([
      ['auth.login', null],
      ['auth.session_expired', 'absolute'],
      ['auth.login', null],
    ]);
    const ended = await t.db.auditLog.findFirstOrThrow({
      where: { action: 'auth.session_expired' },
    });
    expect(ended).toMatchObject({
      entityType: 'session',
      entityId: expired.id,
      userId: expired.userId,
      origin: 'LAN',
    });
  });

  it('ends an idle session server-side, one touch interval past the limit (H19)', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const seenAgo = (ms: number) =>
      t.db.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - ms) } });

    // 15 min limit + 60 s of tolerance for the deferred last_seen_at write.
    await seenAgo(15 * MINUTE + 30_000);
    expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(200);

    await seenAgo(16 * MINUTE + 30_000);
    const response = await request(t.app, 'GET', ME, { cookie });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_SESSION_IDLE');
    expect(await auditEntries(t.db)).toEqual([
      ['auth.login', null],
      ['auth.session_expired', 'idle'],
    ]);
  });

  it('reads the lock delay of tablets and registers from the settings', async () => {
    await t.db.setting.createMany({
      data: [
        { key: 'session.lock_minutes.tablet', value: 7 },
        { key: 'session.lock_minutes.register', value: 20 },
      ],
    });
    const tablet = await createStation(t.db, 'SALES');
    const register = await createStation(t.db, 'REGISTER');
    await createUser(t.db, { username: 'soa', roles: ['cashier'], pin: '1234' });

    const sales = await loginOk(t.app, {
      username: 'vola',
      role: 'sales',
      pin: '1234',
      stationId: tablet.id,
    });
    expect(sales.me.session.idleMinutes).toBe(7);
    await t.db.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 9 * MINUTE) } });
    expect((await request(t.app, 'GET', ME, { cookie: sales.cookie })).json().code).toBe(
      'AUTH_SESSION_IDLE',
    );

    const cashier = await loginOk(t.app, {
      username: 'soa',
      role: 'cashier',
      pin: '1234',
      stationId: register.id,
    });
    expect(cashier.me.session.idleMinutes).toBe(20);
    await t.db.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 17 * MINUTE) } });
    expect((await request(t.app, 'GET', ME, { cookie: cashier.cookie })).statusCode).toBe(200);
  });

  it('refreshes last_seen_at at most once a minute', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const stale = new Date(Date.now() - 2 * 60_000);
    await t.db.session.updateMany({ data: { lastSeenAt: stale } });

    expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(200);
    const touched = await t.db.session.findFirstOrThrow();
    expect(touched.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 5000);

    const recent = new Date(Date.now() - 10_000);
    await t.db.session.updateMany({ data: { lastSeenAt: recent } });
    await request(t.app, 'GET', ME, { cookie });
    const untouched = await t.db.session.findFirstOrThrow();
    expect(untouched.lastSeenAt.getTime()).toBe(recent.getTime());
  });

  it('rejects a shop session presented from outside and destroys it', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });

    const response = await request(t.app, 'GET', ME, { cookie, origin: 'REMOTE' });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_ORIGIN_MISMATCH');
    expect(await t.db.session.count()).toBe(0);
    expect(await auditActions(t.db)).toEqual(['auth.login', 'auth.origin_rejected']);
  });

  it('drops the session of a role no longer held, or of a deactivated account', async () => {
    const roleLost = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    await t.db.user.updateMany({ where: { username: 'vola' }, data: { roles: ['cashier'] } });
    const response = await request(t.app, 'GET', ME, { cookie: roleLost.cookie });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_REQUIRED');
    expect(await t.db.session.count()).toBe(0);

    const deactivated = await loginOk(t.app, { username: 'vola', role: 'cashier', pin: '1234' });
    await t.db.user.updateMany({ where: { username: 'vola' }, data: { isActive: false } });
    expect((await request(t.app, 'GET', ME, { cookie: deactivated.cookie })).statusCode).toBe(401);
    expect(await t.db.session.count()).toBe(0);
    expect(await auditEntries(t.db)).toEqual([
      ['auth.login', null],
      ['auth.session_expired', 'role_lost'],
      ['auth.login', null],
      ['auth.session_expired', 'inactive_account'],
    ]);
  });

  it('answers 404 with the error shape on an unknown route', async () => {
    const response = await request(t.app, 'GET', '/api/v1/nothing-here');
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'NOT_FOUND', message: expect.any(String) });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('cookie flags with COOKIE_SECURE', () => {
  it('uses the __Host- prefix and Secure when enabled, on the way in and out', async () => {
    const t = await createTestApp({ COOKIE_SECURE: 'true' });
    try {
      await t.reset();
      await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234' });
      const response = await request(t.app, 'POST', '/api/v1/auth/login', {
        body: { username: 'vola', role: 'sales', pin: '1234' },
      });
      expect(response.statusCode).toBe(200);
      expect(t.cookieName).toBe('__Host-vw_session');
      expect(response.cookies[0]).toMatchObject({ name: t.cookieName, secure: true, path: '/' });

      const cookie = sessionCookie(response, t.cookieName) ?? '';
      const withCookie = { cookie, cookieName: t.cookieName };
      expect((await request(t.app, 'GET', ME, withCookie)).statusCode).toBe(200);
      // The plain name is not the session: nothing to resolve.
      expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(401);

      const logout = await request(t.app, 'POST', '/api/v1/auth/logout', withCookie);
      expect(logout.statusCode).toBe(204);
      expect(logout.cookies[0]).toMatchObject({ name: t.cookieName, value: '', secure: true });
    } finally {
      await t.close();
    }
  });
});
