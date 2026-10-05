import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdmin } from '../src/services/admin-bootstrap.js';
import { generateTotpCode } from '../src/services/totp.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  auditEntries,
  createTestApp,
  createUser,
  login,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const SET_BY_ADMIN = 'Given-by-adm1!';
const CHOSEN = 'Mine-only-42!';

describe.skipIf(!TEST_DATABASE_URL)('a password set by the admin (H20, T-016c)', () => {
  let t: TestApp;
  let adminCookie: string;
  let mgr: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'adm', roles: ['admin'], password: 'Admin-1234!' });
    mgr = await createUser(t.db, { username: 'mgr', roles: ['manager'], totpSecret: TOTP_SECRET });
    adminCookie = (
      await loginOk(t.app, { username: 'adm', role: 'admin', password: 'Admin-1234!' })
    ).cookie;
    const set = await request(t.app, 'PUT', `/api/v1/users/${mgr.id}/password`, {
      cookie: adminCookie,
      body: { password: SET_BY_ADMIN },
    });
    expect(set.statusCode).toBe(204);
  });

  const account = async () =>
    (await request(t.app, 'GET', '/api/v1/users', { cookie: adminCookie }))
      .json()
      .users.find((user: { id: string }) => user.id === mgr.id);
  const asMgr = (input: { password: string; newPassword?: string }) =>
    login(t.app, { username: 'mgr', role: 'manager', ...input });

  it('is replaced by the user’s own at the next login, audited', async () => {
    expect(await account()).toMatchObject({ hasPassword: true, passwordChangeRequired: true });

    const asked = await asMgr({ password: SET_BY_ADMIN });
    expect([asked.response.statusCode, asked.response.json().code]).toEqual([
      403,
      'AUTH_PASSWORD_CHANGE_REQUIRED',
    ]);
    const same = await asMgr({ password: SET_BY_ADMIN, newPassword: SET_BY_ADMIN });
    expect([same.response.statusCode, same.response.json().code]).toEqual([
      400,
      'AUTH_PASSWORD_UNCHANGED',
    ]);
    // The password was right both times: no failure counted (RG-USR-05).
    const row = await t.db.user.findUniqueOrThrow({ where: { id: mgr.id } });
    expect(row.failedLoginCount).toBe(0);

    const wrong = await asMgr({ password: 'Not-the-one-1', newPassword: CHOSEN });
    expect(wrong.response.statusCode).toBe(401);

    const changed = await asMgr({ password: SET_BY_ADMIN, newPassword: CHOSEN });
    expect(changed.response.statusCode).toBe(200);
    expect(changed.me.session.activeRole).toBe('manager');
    expect(await account()).toMatchObject({ passwordChangeRequired: false });
    expect((await asMgr({ password: SET_BY_ADMIN })).response.statusCode).toBe(401);
    await loginOk(t.app, { username: 'mgr', role: 'manager', password: CHOSEN });

    expect(await auditActions(t.db, mgr.id)).toEqual([
      'user.password_set',
      'auth.login_failed',
      'user.password_set',
      'auth.login_failed',
    ]);
    const own = await t.db.auditLog.findFirstOrThrow({ where: { reason: 'change_required' } });
    expect(own).toMatchObject({
      userId: mgr.id,
      activeRole: 'manager',
      before: { passwordChangeRequired: true },
      after: { passwordChangeRequired: false },
    });
  });

  it('keeps the TOTP code unspent while it asks for the new password, outside the shop (RG-USR-04)', async () => {
    const code = generateTotpCode(TOTP_SECRET);
    const remote = { origin: 'REMOTE' as const, totp: code };
    await t.db.user.update({ where: { id: mgr.id }, data: { roles: ['admin', 'manager'] } });
    const first = await login(t.app, {
      username: 'mgr',
      role: 'admin',
      password: SET_BY_ADMIN,
      ...remote,
    });
    expect(first.response.json().code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    const changed = await login(t.app, {
      username: 'mgr',
      role: 'admin',
      password: SET_BY_ADMIN,
      newPassword: CHOSEN,
      ...remote,
    });
    expect(changed.response.statusCode).toBe(200);
    expect(changed.me.session.authMethod).toBe('PASSWORD_TOTP');
  });

  it('is cleared when the user changes it themselves', async () => {
    await t.db.user.update({ where: { id: mgr.id }, data: { passwordChangeRequired: false } });
    const { cookie } = await loginOk(t.app, {
      username: 'mgr',
      role: 'manager',
      password: SET_BY_ADMIN,
    });
    await t.db.user.update({ where: { id: mgr.id }, data: { passwordChangeRequired: true } });
    const response = await request(t.app, 'PUT', '/api/v1/auth/password', {
      cookie,
      body: { current: SET_BY_ADMIN, password: CHOSEN },
    });
    expect(response.statusCode).toBe(204);
    expect(await account()).toMatchObject({ passwordChangeRequired: false });
  });
});

describe.skipIf(!TEST_DATABASE_URL)('admin:bootstrap, the first admin (T-016c)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => t.reset());

  const first = { username: 'admin', fullName: 'Hery Rakoto' };

  it('creates the admin once, with a provisional password replaced at the first login', async () => {
    const result = await bootstrapAdmin(t.db, first);
    if (!result.created) throw new Error('no admin created');
    expect(result.password).toMatch(/^[2-9A-Z]{4}(-[2-9A-Z]{4}){3}$/);
    expect(await auditEntries(t.db)).toEqual([['user.created', 'bootstrap']]);
    const row = await t.db.auditLog.findFirstOrThrow({ where: { action: 'user.created' } });
    expect(row).toMatchObject({ userId: null, entityId: result.userId });

    const asked = await login(t.app, {
      username: 'admin',
      role: 'admin',
      password: result.password,
    });
    expect(asked.response.json().code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    await loginOk(t.app, {
      username: 'admin',
      role: 'admin',
      password: result.password,
      newPassword: CHOSEN,
    });

    expect(await bootstrapAdmin(t.db, { username: 'other', fullName: 'Other' })).toEqual({
      created: false,
    });
    expect(await t.db.user.count()).toBe(1);
  });

  it('runs again only when no admin is active, never over a taken username', async () => {
    await createUser(t.db, { username: 'admin', roles: ['admin'], isActive: false });
    await expect(bootstrapAdmin(t.db, first)).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
    const result = await bootstrapAdmin(t.db, { username: 'admin2', fullName: 'Hery Rakoto' });
    expect(result.created).toBe(true);
  });
});
