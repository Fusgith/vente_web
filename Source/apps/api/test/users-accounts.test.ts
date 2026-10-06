import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const USERS = '/api/v1/users';
const ME = '/api/v1/auth/me';

describe.skipIf(!TEST_DATABASE_URL)(
  'accounts managed by the admin (T-016, RG-USR-01/02/06)',
  () => {
    let t: TestApp;
    let adminCookie: string;
    let adm: { id: string };

    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      await t.reset();
      adm = await createUser(t.db, { username: 'adm', roles: ['admin'], password: 'Admin-1234!' });
      adminCookie = (
        await loginOk(t.app, { username: 'adm', role: 'admin', password: 'Admin-1234!' })
      ).cookie;
    });

    const create = (body: object, cookie = adminCookie) =>
      request(t.app, 'POST', USERS, { cookie, body });
    const update = (id: string, body: object) =>
      request(t.app, 'PATCH', `${USERS}/${id}`, { cookie: adminCookie, body });

    it('is reserved to the admin role', async () => {
      await createUser(t.db, { username: 'chef', roles: ['manager'], password: '1234' });
      const { cookie } = await loginOk(t.app, {
        username: 'chef',
        role: 'manager',
        password: '1234',
      });
      expect((await request(t.app, 'GET', USERS, { cookie })).statusCode).toBe(403);
      expect(
        (await create({ username: 'x', fullName: 'X', roles: ['cashier'] }, cookie)).statusCode,
      ).toBe(403);
    });

    it('creates an account with several roles, without any secret; audited', async () => {
      const response = await create({
        username: 'vola',
        fullName: 'Vola Rakoto',
        roles: ['sales', 'cashier'],
        ticketLetter: 'b',
      });
      expect(response.statusCode).toBe(201);
      const account = response.json();
      expect(account).toMatchObject({
        username: 'vola',
        roles: ['sales', 'cashier'],
        ticketLetter: 'B',
        isActive: true,
        hasPassword: false,
        totpEnabled: false,
      });
      const row = await t.db.auditLog.findFirstOrThrow({ where: { action: 'user.created' } });
      expect(row).toMatchObject({ userId: adm.id, entityId: account.id });
      expect(row.after).toMatchObject({ username: 'vola', roles: ['sales', 'cashier'] });

      const list = await request(t.app, 'GET', USERS, { cookie: adminCookie });
      expect(list.json().users.map((user: { username: string }) => user.username)).toEqual([
        'adm',
        'vola',
      ]);
    });

    it('refuses a username taken in any case, a sales user without letter or with a taken one', async () => {
      await createUser(t.db, { username: 'Vola', roles: ['sales'], ticketLetter: 'A' });
      const twin = await create({ username: 'vola', fullName: 'V', roles: ['cashier'] });
      expect([twin.statusCode, twin.json().code]).toEqual([409, 'USERNAME_TAKEN']);
      const noLetter = await create({ username: 'hery', fullName: 'H', roles: ['sales'] });
      expect([noLetter.statusCode, noLetter.json().code]).toEqual([400, 'TICKET_LETTER_REQUIRED']);
      const letter = await create({
        username: 'hery',
        fullName: 'H',
        roles: ['sales'],
        ticketLetter: 'A',
      });
      expect([letter.statusCode, letter.json().code]).toEqual([409, 'TICKET_LETTER_TAKEN']);
    });

    it('changes the roles: the sessions of the account close, the change is audited', async () => {
      const vola = await createUser(t.db, {
        username: 'vola',
        roles: ['cashier'],
        password: '1234',
      });
      const { cookie } = await loginOk(t.app, {
        username: 'vola',
        role: 'cashier',
        password: '1234',
      });
      const response = await update(vola.id, {
        roles: ['cashier', 'warehouse'],
        fullName: 'Vola R.',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ roles: ['cashier', 'warehouse'], hasPassword: true });
      expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(401);
      expect(await auditActions(t.db, vola.id)).toEqual(['user.updated', 'user.sessions_revoked']);
      const row = await t.db.auditLog.findFirstOrThrow({ where: { action: 'user.updated' } });
      expect(row.before).toEqual({ fullName: 'User vola', roles: ['cashier'] });
      expect(row.after).toEqual({ fullName: 'Vola R.', roles: ['cashier', 'warehouse'] });
    });

    it('deactivates instead of deleting: no more login, history kept (RG-USR-06)', async () => {
      const vola = await createUser(t.db, {
        username: 'vola',
        roles: ['cashier'],
        password: '1234',
      });
      const { cookie } = await loginOk(t.app, {
        username: 'vola',
        role: 'cashier',
        password: '1234',
      });
      const response = await update(vola.id, { isActive: false });
      expect(response.json().isActive).toBe(false);
      expect((await request(t.app, 'GET', ME, { cookie })).statusCode).toBe(401);
      expect(await auditActions(t.db, vola.id)).toContain('user.deactivated');
      expect(await t.db.user.count({ where: { id: vola.id } })).toBe(1);
    });

    it('keeps an active admin: the last one keeps its role and stays active', async () => {
      const lose = await update(adm.id, { roles: ['manager'] });
      expect([lose.statusCode, lose.json().code]).toEqual([409, 'LAST_ADMIN']);
      const off = await update(adm.id, { isActive: false });
      expect(off.json().code).toBe('LAST_ADMIN');

      await createUser(t.db, { username: 'adm2', roles: ['admin'] });
      expect((await update(adm.id, { roles: ['admin', 'manager'] })).statusCode).toBe(200);
      // Its own roles changed: the admin logs in again with the new rights.
      expect((await request(t.app, 'GET', ME, { cookie: adminCookie })).statusCode).toBe(401);
    });

    it('changes nothing when nothing differs', async () => {
      const response = await update(adm.id, { fullName: 'User adm' });
      expect(response.statusCode).toBe(200);
      expect(await auditActions(t.db, adm.id)).toEqual([]);
    });
  },
);
