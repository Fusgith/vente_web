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
  type TestApp,
} from './helpers.js';

const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const ME = '/api/v1/auth/me';

describe.skipIf(!TEST_DATABASE_URL)('admin credential management (/users/:id/*, annexe B)', () => {
  let t: TestApp;
  let adminCookie: string;
  let vola: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'adm', roles: ['admin'], password: 'Admin-1234!' });
    vola = await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234' });
    adminCookie = (
      await loginOk(t.app, { username: 'adm', role: 'admin', password: 'Admin-1234!' })
    ).cookie;
  });

  it('is reserved to the admin role', async () => {
    await createUser(t.db, { username: 'chef', roles: ['manager'], pin: '1234' });
    const { cookie } = await loginOk(t.app, { username: 'chef', role: 'manager', pin: '1234' });
    const response = await request(t.app, 'PUT', `/api/v1/users/${vola.id}/pin`, {
      cookie,
      body: { pin: '9999' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('AUTH_FORBIDDEN');
    expect(
      (await request(t.app, 'PUT', `/api/v1/users/${vola.id}/pin`, { body: { pin: '9999' } }))
        .statusCode,
    ).toBe(401);
  });

  it('sets a PIN: the target logs in with it and loses its sessions; the change is audited', async () => {
    const before = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const response = await request(t.app, 'PUT', `/api/v1/users/${vola.id}/pin`, {
      cookie: adminCookie,
      body: { pin: '9999' },
    });
    expect(response.statusCode).toBe(204);
    expect((await request(t.app, 'GET', ME, { cookie: before.cookie })).statusCode).toBe(401);
    expect((await request(t.app, 'GET', ME, { cookie: adminCookie })).statusCode).toBe(200);
    expect(
      (await login(t.app, { username: 'vola', role: 'sales', pin: '9999' })).response.statusCode,
    ).toBe(200);

    const adm = await t.db.user.findUniqueOrThrow({ where: { username: 'adm' } });
    const row = await t.db.auditLog.findFirstOrThrow({ where: { action: 'user.pin_set' } });
    expect(row).toMatchObject({
      userId: adm.id,
      activeRole: 'admin',
      entityType: 'user',
      entityId: vola.id,
    });
  });

  it('validates the id and reports an unknown account', async () => {
    const bad = await request(t.app, 'PUT', '/api/v1/users/not-a-uuid/pin', {
      cookie: adminCookie,
      body: { pin: '9999' },
    });
    expect(bad.statusCode).toBe(400);
    const missing = await request(
      t.app,
      'PUT',
      '/api/v1/users/00000000-0000-7000-8000-000000000000/pin',
      {
        cookie: adminCookie,
        body: { pin: '9999' },
      },
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('NOT_FOUND');
  });

  it('unlocks a locked account before the delay (RG-USR-05)', async () => {
    for (let i = 0; i < 5; i += 1)
      await login(t.app, { username: 'vola', role: 'sales', pin: '0000' });
    expect(
      (await login(t.app, { username: 'vola', role: 'sales', pin: '1234' })).response.statusCode,
    ).toBe(423);

    const response = await request(t.app, 'POST', `/api/v1/users/${vola.id}/unlock`, {
      cookie: adminCookie,
    });
    expect(response.statusCode).toBe(204);
    expect(
      (await login(t.app, { username: 'vola', role: 'sales', pin: '1234' })).response.statusCode,
    ).toBe(200);
    expect(await auditActions(t.db, vola.id)).toContain('user.unlocked');
  });

  it('resets TOTP and kills the remote session that relied on it', async () => {
    const boss = await createUser(t.db, {
      username: 'boss',
      roles: ['owner'],
      password: 'Boss-1234!',
      totpSecret: TOTP_SECRET,
    });
    const resetTotp = () =>
      request(t.app, 'DELETE', `/api/v1/users/${boss.id}/totp`, { cookie: adminCookie });
    const remote = await loginOk(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
      totp: generateTotpCode(TOTP_SECRET),
      origin: 'REMOTE',
    });

    expect((await resetTotp()).statusCode).toBe(204);
    expect(
      (await request(t.app, 'GET', ME, { cookie: remote.cookie, origin: 'REMOTE' })).statusCode,
    ).toBe(401);
    expect(await auditActions(t.db, boss.id)).toEqual(['user.totp_reset', 'user.sessions_revoked']);

    // A session opened in the shop never used the code: it goes on.
    await t.db.user.update({
      where: { id: boss.id },
      data: { totpSecret: TOTP_SECRET, totpEnabledAt: new Date() },
    });
    const local = await loginOk(t.app, { username: 'boss', role: 'owner', password: 'Boss-1234!' });
    expect((await resetTotp()).statusCode).toBe(204);
    const me = await request(t.app, 'GET', ME, { cookie: local.cookie });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.totpEnabled).toBe(false);
  });

  it('revokes the session of an account', async () => {
    const { cookie } = await loginOk(t.app, { username: 'vola', role: 'sales', pin: '1234' });
    const response = await request(t.app, 'DELETE', `/api/v1/users/${vola.id}/sessions`, {
      cookie: adminCookie,
    });
    expect(response.statusCode).toBe(204);
    expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(401);
    const row = await t.db.auditLog.findFirstOrThrow({
      where: { action: 'user.sessions_revoked' },
    });
    expect(row.after).toEqual({ count: 1 });
  });

  it('sets a password, refusing a PIN on a non-operational account', async () => {
    const other = await createUser(t.db, { username: 'adm2', roles: ['admin'] });
    const pin = await request(t.app, 'PUT', `/api/v1/users/${other.id}/pin`, {
      cookie: adminCookie,
      body: { pin: '1234' },
    });
    expect(pin.statusCode).toBe(400);
    expect(pin.json().code).toBe('PIN_REQUIRES_OPERATIONAL_ROLE');

    const password = await request(t.app, 'PUT', `/api/v1/users/${other.id}/password`, {
      cookie: adminCookie,
      body: { password: 'Admin2-1234!' },
    });
    expect(password.statusCode).toBe(204);
    expect(
      (await login(t.app, { username: 'adm2', role: 'admin', password: 'Admin2-1234!' })).response
        .statusCode,
    ).toBe(200);
  });

  it('never sets the owner’s password: the owner alone chooses it (RG-USR-10)', async () => {
    const boss = await createUser(t.db, {
      username: 'boss',
      roles: ['owner'],
      password: 'Boss-1234!',
    });
    const response = await request(t.app, 'PUT', `/api/v1/users/${boss.id}/password`, {
      cookie: adminCookie,
      body: { password: 'Admin-knows-1!' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('OWNER_PASSWORD_SELF_ONLY');
    expect(
      (await login(t.app, { username: 'boss', role: 'owner', password: 'Admin-knows-1!' })).response
        .statusCode,
    ).toBe(401);
    // Nothing changed: the only trace is the failed login with the admin's password.
    expect(await auditActions(t.db, boss.id)).toEqual(['auth.login_failed']);
  });
});
