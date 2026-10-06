import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AuthContext } from '../src/services/sessions.js';
import { switchRole } from '../src/services/switch-role.js';
import { generateTotpCode } from '../src/services/totp.js';
import { TEST_DATABASE_URL } from './db.js';
import {
  auditActions,
  createStation,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const ME = '/api/v1/auth/me';

describe.skipIf(!TEST_DATABASE_URL)('POST /api/v1/auth/switch-role', () => {
  let t: TestApp;
  const SWITCH = '/api/v1/auth/switch-role';

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    await createUser(t.db, {
      username: 'vola',
      roles: ['sales', 'cashier', 'admin'],
      password: 'Shop-1234!',
    });
  });

  it('switches between held roles and audits it', async () => {
    // Without a station the account opens its first role in the fixed order (H57).
    const { cookie, me } = await loginOk(t.app, { username: 'vola', password: 'Shop-1234!' });
    expect(me.session.activeRole).toBe('admin');
    const response = await request(t.app, 'POST', SWITCH, { cookie, body: { role: 'cashier' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().session.activeRole).toBe('cashier');
    expect((await request(t.app, 'GET', ME, { cookie })).json().session.activeRole).toBe('cashier');
    expect(await auditActions(t.db)).toEqual(['auth.login', 'auth.role_switched']);
  });

  it('refuses a role not held; admin stays reachable from a password session (H57)', async () => {
    const { cookie } = await loginOk(t.app, {
      username: 'vola',
      role: 'sales',
      password: 'Shop-1234!',
    });
    const notHeld = await request(t.app, 'POST', SWITCH, { cookie, body: { role: 'manager' } });
    expect(notHeld.statusCode).toBe(403);
    expect(notHeld.json().code).toBe('AUTH_FORBIDDEN');

    const admin = await request(t.app, 'POST', SWITCH, { cookie, body: { role: 'admin' } });
    expect(admin.statusCode).toBe(200);
    expect(admin.json().session.activeRole).toBe('admin');
  });

  it('keeps a remote session on remote roles (T3)', async () => {
    await createUser(t.db, {
      username: 'boss',
      roles: ['owner', 'sales'],
      password: 'Boss-1234!',
      totpSecret: TOTP_SECRET,
    });
    const { cookie } = await loginOk(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
      totp: generateTotpCode(TOTP_SECRET),
      origin: 'REMOTE',
    });
    const response = await request(t.app, 'POST', SWITCH, {
      cookie,
      origin: 'REMOTE',
      body: { role: 'sales' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('AUTH_ROLE_REMOTE_FORBIDDEN');
  });

  it('respects the station type (H21)', async () => {
    const tablet = await createStation(t.db, 'SALES');
    const { cookie } = await loginOk(t.app, {
      username: 'vola',
      role: 'sales',
      password: 'Shop-1234!',
      stationId: tablet.id,
    });
    const response = await request(t.app, 'POST', SWITCH, { cookie, body: { role: 'cashier' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('STATION_INVALID');
  });

  it('fails closed when the session vanished between the check and the switch', async () => {
    const { me } = await loginOk(t.app, { username: 'vola', password: 'Shop-1234!' });
    const user = await t.db.user.findUniqueOrThrow({ where: { username: 'vola' } });
    const auth: AuthContext = {
      user: { ...me.user, id: user.id },
      session: {
        id: randomUUID(),
        activeRole: 'sales',
        origin: 'LAN',
        authMethod: 'PASSWORD',
        stationId: null,
        stationType: null,
        expiresAt: new Date(me.session.expiresAt),
      },
      idleMinutes: me.session.idleMinutes,
    };
    await expect(switchRole(t.db, auth, 'cashier')).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
    });
    expect(await auditActions(t.db)).toEqual(['auth.login']);
  });
});
