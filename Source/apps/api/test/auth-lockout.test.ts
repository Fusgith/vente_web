import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reserveLoginAttempt } from '../src/services/lockout.js';
import { generateTotpCode } from '../src/services/totp.js';
import { TEST_DATABASE_URL } from './db.js';
import { auditActions, createTestApp, createUser, login, type TestApp } from './helpers.js';

const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const MINUTE = 60_000;

describe.skipIf(!TEST_DATABASE_URL)('account lockout (RG-USR-05, H19)', () => {
  let t: TestApp;
  let volaId: string;

  const wrongPin = () => login(t.app, { username: 'vola', role: 'sales', pin: '0000' });
  const rightPin = () => login(t.app, { username: 'vola', role: 'sales', pin: '1234' });
  const vola = () => t.db.user.findUniqueOrThrow({ where: { id: volaId } });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await t.reset();
    volaId = (await createUser(t.db, { username: 'vola', roles: ['sales'], pin: '1234' })).id;
  });

  it('locks the account after 5 failures for 15 minutes, visibly in the shop only', async () => {
    await t.db.user.update({ where: { id: volaId }, data: { totpPendingSecret: TOTP_SECRET } });
    for (let i = 0; i < 5; i += 1) expect((await wrongPin()).response.statusCode).toBe(401);

    const locked = await rightPin();
    expect(locked.response.statusCode).toBe(423);
    expect(locked.response.json()).toMatchObject({ code: 'AUTH_LOCKED' });
    expect(locked.response.json().details.retryAfterSeconds).toBeGreaterThan(14 * 60);

    const user = await vola();
    expect(user.lockedUntil).not.toBeNull();
    expect(user.failedLoginCount).toBe(5);
    // A pending enrolment dies with the lock; the refused attempt itself is not audited.
    expect(user.totpPendingSecret).toBeNull();
    expect(await auditActions(t.db, volaId)).toEqual([
      ...Array<string>(5).fill('auth.login_failed'),
      'auth.locked',
    ]);
    const lock = await t.db.auditLog.findFirstOrThrow({ where: { action: 'auth.locked' } });
    expect(lock).toMatchObject({ userId: null, entityType: 'user', reason: 'invalid_secret' });
  });

  it('keeps one clock with the database, whatever timezone the server runs in', async () => {
    // Prisma reads and writes timestamps without offset: the connection must speak UTC,
    // or every comparison with now() in SQL is off by the server's offset (3 h here).
    const [row] = await t.db.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    expect(Math.abs((row?.now.getTime() ?? 0) - Date.now())).toBeLessThan(10_000);
  });

  it('hides the lock from outside the shop', async () => {
    const boss = await createUser(t.db, {
      username: 'boss',
      roles: ['owner'],
      password: 'Boss-1234!',
      totpSecret: TOTP_SECRET,
    });
    await t.db.user.update({
      where: { id: boss.id },
      data: { lockedUntil: new Date(Date.now() + 10 * MINUTE) },
    });
    const { response } = await login(t.app, {
      username: 'boss',
      role: 'owner',
      password: 'Boss-1234!',
      totp: generateTotpCode(TOTP_SECRET),
      origin: 'REMOTE',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(await auditActions(t.db)).toEqual([]);
  });

  it('lets a right fifth secret through: the lock is only taken while it is checked', async () => {
    for (let i = 0; i < 4; i += 1) await wrongPin();
    expect((await rightPin()).response.statusCode).toBe(200);

    const user = await vola();
    expect(user.lockedUntil).toBeNull();
    expect(user.failedLoginCount).toBe(0);
    expect(await auditActions(t.db, volaId)).not.toContain('auth.locked');
  });

  it('lifts the lock after its delay and starts a new window', async () => {
    for (let i = 0; i < 5; i += 1) await wrongPin();
    await t.db.user.update({
      where: { id: volaId },
      data: { lockedUntil: new Date(Date.now() - MINUTE) },
    });

    expect((await wrongPin()).response.statusCode).toBe(401);
    let user = await vola();
    expect(user.failedLoginCount).toBe(1);
    expect(user.lockedUntil).toBeNull();

    expect((await rightPin()).response.statusCode).toBe(200);
    user = await vola();
    expect(user.failedLoginCount).toBe(0);
    expect(user.lastFailedAt).toBeNull();
  });

  it('forgets failures older than the window (sliding window)', async () => {
    for (let i = 0; i < 4; i += 1) await wrongPin();
    await t.db.user.update({
      where: { id: volaId },
      data: { lastFailedAt: new Date(Date.now() - 16 * MINUTE) },
    });

    expect((await wrongPin()).response.statusCode).toBe(401);
    const user = await vola();
    expect(user.failedLoginCount).toBe(1);
    expect(user.lockedUntil).toBeNull();
  });

  it('never verifies more than five secrets per window, however many requests race', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => wrongPin()));
    const statuses = results.map((r) => r.response.statusCode).sort();
    expect(statuses).toEqual([401, 401, 401, 401, 401, 423, 423, 423]);
    expect((await vola()).failedLoginCount).toBe(5);
    expect(await auditActions(t.db, volaId)).toEqual([
      ...Array<string>(5).fill('auth.login_failed'),
      'auth.locked',
    ]);
  });

  it('reserves attempt slots atomically, counted by the database clock', async () => {
    const reservations = await Promise.all(
      Array.from({ length: 30 }, () => reserveLoginAttempt(t.db, volaId)),
    );
    const slots = reservations.flatMap((r) => (r.allowed ? [r.slot] : []));
    const retryAfter = reservations.flatMap((r) => (r.allowed ? [] : [r.retryAfterSeconds]));
    expect(slots).toHaveLength(5);
    expect(retryAfter).toHaveLength(25);
    expect(slots.map((slot) => slot.count).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(slots.filter((slot) => slot.lockedUntil !== null)).toHaveLength(1);
    for (const seconds of retryAfter) expect(seconds).toBeGreaterThan(14 * 60);
  });
});
