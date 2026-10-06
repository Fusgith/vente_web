import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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

const ACTIVATE = '/api/v1/auth/activate';
const ME = '/api/v1/auth/me';
const NEW_PASSWORD = 'Boss-chosen-1!';

describe.skipIf(!TEST_DATABASE_URL)('the owner activation code (RG-USR-10, H20, T-016b)', () => {
  let t: TestApp;
  let adminCookie: string;
  let boss: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, { username: 'adm', roles: ['admin'], password: 'Admin-1234!' });
    boss = await createUser(t.db, { username: 'boss', roles: ['owner'], password: 'Boss-1234!' });
    adminCookie = (
      await loginOk(t.app, { username: 'adm', role: 'admin', password: 'Admin-1234!' })
    ).cookie;
  });

  const issue = (id: string) =>
    request(t.app, 'POST', `/api/v1/users/${id}/activation-code`, { cookie: adminCookie });
  const activate = (code: string, username = 'boss') =>
    request(t.app, 'POST', ACTIVATE, { body: { username, code, password: NEW_PASSWORD } });

  it('is issued once to the admin, 24 h, owner accounts only; only its hash is kept', async () => {
    const response = await issue(boss.id);
    expect(response.statusCode).toBe(201);
    const { code, expiresAt } = response.json();
    expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    const hours = (Date.parse(expiresAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    const row = await t.db.user.findUniqueOrThrow({ where: { id: boss.id } });
    expect(row.activationCodeHash).not.toContain(code);
    expect(await auditActions(t.db, boss.id)).toEqual(['user.activation_issued']);

    const cashier = await createUser(t.db, {
      username: 'vola',
      roles: ['cashier'],
      password: '1234',
    });
    const refused = await issue(cashier.id);
    expect([refused.statusCode, refused.json().code]).toEqual([400, 'ACTIVATION_OWNER_ONLY']);
  });

  it('lets the owner choose their password: code spent, old sessions closed, audited', async () => {
    const { cookie } = await loginOk(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
    });
    const { code } = (await issue(boss.id)).json();
    // Typed as read aloud: case, spaces and hyphens do not count.
    expect((await activate(code.toLowerCase().replace(/-/g, ' '))).statusCode).toBe(204);

    expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(401);
    await loginOk(t.app, { username: 'boss', role: 'owner', password: NEW_PASSWORD });
    const old = await login(t.app, { username: 'boss', role: 'owner', password: 'Boss-1234!' });
    expect(old.response.statusCode).toBe(401);
    expect(await auditActions(t.db, boss.id)).toEqual([
      'user.activation_issued',
      'user.activation_used',
      'user.sessions_revoked',
      'auth.login_failed',
    ]);

    const again = await activate(code);
    expect([again.statusCode, again.json().code]).toEqual([401, 'ACTIVATION_INVALID']);
  });

  it('keeps only the last code issued', async () => {
    const first = (await issue(boss.id)).json().code;
    const second = (await issue(boss.id)).json().code;
    expect((await activate(first)).json().code).toBe('ACTIVATION_INVALID');
    expect((await activate(second)).statusCode).toBe(204);
  });

  it('refuses an expired code, counted as a failed login (RG-USR-05)', async () => {
    const { code } = (await issue(boss.id)).json();
    await t.db.user.update({
      where: { id: boss.id },
      data: { activationExpiresAt: new Date(Date.now() - 1000) },
    });
    const response = await activate(code);
    expect([response.statusCode, response.json().code]).toEqual([401, 'ACTIVATION_INVALID']);
    const row = await t.db.user.findUniqueOrThrow({ where: { id: boss.id } });
    expect(row.failedLoginCount).toBe(1);
    expect(row.activationCodeHash).not.toBeNull();
  });

  it('answers the same for an unknown account, without auditing it', async () => {
    const response = await activate('AAAA-BBBB-CCCC', 'nobody');
    expect([response.statusCode, response.json().code]).toEqual([401, 'ACTIVATION_INVALID']);
    expect(await auditActions(t.db)).toEqual(['auth.login']);
  });

  it('locks the account after repeated wrong codes', async () => {
    await issue(boss.id);
    for (let i = 0; i < 5; i++) await activate('AAAA-BBBB-CCCC');
    const response = await activate('AAAA-BBBB-CCCC');
    expect(response.statusCode).toBe(423);
    expect(await auditActions(t.db, boss.id)).toContain('auth.locked');
  });
});
