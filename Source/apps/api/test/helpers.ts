import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { AccessOrigin, AuthMe, Role } from '@vente-web/shared';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';

import { buildApp } from '../src/app.js';
import type { PushSend } from '../src/plugins/push.js';
import type { Db } from '../src/db.js';
import { loadEnv } from '../src/env.js';
import type { StationType } from '../src/generated/prisma/enums.js';
import { hashSecret } from '../src/services/password-hash.js';
import { sessionCookieName } from '../src/services/sessions.js';
import { clearSettingsCache } from '../src/services/settings.js';
import { TEST_DATABASE_URL, createTestDb, resetDb } from './db.js';

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  /** Where this app writes its invoices (`FILES_DIR`). */
  filesDir: string;
  /** Name of the session cookie this app sets (`__Host-` prefixed when secure). */
  cookieName: string;
  /** Warnings and errors the app logged since the last reset, with `captureLogs` only. */
  logs: Record<string, unknown>[];
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * App wired to the test database; LAN by default, like the shop's own listener (the env's own
 * default outside production). `AUTH_DEFAULT_ORIGIN: 'REMOTE'` reproduces the production
 * behaviour for a request without the origin header.
 */
export async function createTestApp(
  envOverrides: Record<string, string> = {},
  {
    captureLogs = false,
    push,
  }: {
    captureLogs?: boolean;
    /** The owner's notifications go to this fake push service (T-033e). */
    push?: PushSend;
  } = {},
): Promise<TestApp> {
  const db = createTestDb();
  const logs: Record<string, unknown>[] = [];
  const sink = {
    write: (line: string) => void logs.push(JSON.parse(line) as Record<string, unknown>),
  };
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL ?? '',
    COOKIE_SECURE: 'false',
    // Issued documents of this app only, thrown away with the machine's temporary files.
    FILES_DIR: await mkdtemp(path.join(tmpdir(), 'vente-files-')),
    ...envOverrides,
  });
  const logger = captureLogs ? { level: 'warn', stream: sink } : false;
  const app = await buildApp({
    env,
    db,
    fastify: { logger },
    expiry: { sweepMs: 0 },
    ...(push ? { push: { send: push } } : {}),
  });
  await app.ready();
  return {
    app,
    db,
    filesDir: env.FILES_DIR,
    cookieName: sessionCookieName(env.COOKIE_SECURE),
    logs,
    reset: async () => {
      logs.length = 0;
      clearSettingsCache();
      await resetDb(db);
    },
    close: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}

export interface RequestOptions {
  body?: unknown;
  cookie?: string;
  /** Cookie name when the app is not the default one (see `TestApp.cookieName`). */
  cookieName?: string;
  /** Simulated listener: sets `x-access-origin` from the (trusted) loopback peer. */
  origin?: AccessOrigin;
  remoteAddress?: string;
  /** Extra headers; `undefined` removes a default one. */
  headers?: Record<string, string | undefined>;
}

const DEFAULT_COOKIE = sessionCookieName(false);

/** A first-party browser request (`Sec-Fetch-Site: same-origin`) unless headers say otherwise. */
export function request(
  app: FastifyInstance,
  method: NonNullable<InjectOptions['method']>,
  url: string,
  options: RequestOptions = {},
): Promise<LightMyRequestResponse> {
  const merged: Record<string, string | undefined> = { 'sec-fetch-site': 'same-origin' };
  if (options.origin) merged['x-access-origin'] = options.origin.toLowerCase();
  Object.assign(merged, options.headers);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(merged))
    if (value !== undefined) headers[name] = value;
  const inject: InjectOptions = { method, url, headers };
  if (options.body !== undefined)
    inject.payload = options.body as NonNullable<InjectOptions['payload']>;
  if (options.cookie) inject.cookies = { [options.cookieName ?? DEFAULT_COOKIE]: options.cookie };
  if (options.remoteAddress) inject.remoteAddress = options.remoteAddress;
  return app.inject(inject);
}

export function sessionCookie(
  response: LightMyRequestResponse,
  name = DEFAULT_COOKIE,
): string | undefined {
  return response.cookies.find((cookie) => cookie.name === name)?.value;
}

export interface TestUserInput {
  username: string;
  roles: Role[];
  pin?: string;
  password?: string;
  /** Base32 secret, enabled right away. */
  totpSecret?: string;
  isActive?: boolean;
  /** Letter of a salesperson's call tickets (RG-USR-07). */
  ticketLetter?: string;
}

export async function createUser(db: Db, input: TestUserInput): Promise<{ id: string }> {
  return db.user.create({
    data: {
      username: input.username,
      fullName: `User ${input.username}`,
      roles: input.roles,
      pinHash: input.pin ? await hashSecret(input.pin) : null,
      passwordHash: input.password ? await hashSecret(input.password) : null,
      totpSecret: input.totpSecret ?? null,
      totpEnabledAt: input.totpSecret ? new Date() : null,
      isActive: input.isActive ?? true,
      ticketLetter: input.ticketLetter ?? null,
    },
    select: { id: true },
  });
}

export async function createStation(
  db: Db,
  type: StationType,
  isActive = true,
): Promise<{ id: string }> {
  return db.station.create({
    data: { type, name: `${type} test`, isActive },
    select: { id: true },
  });
}

export interface LoginInput {
  username: string;
  role: Role;
  pin?: string;
  password?: string;
  totp?: string;
  newPassword?: string;
  stationId?: string;
  origin?: AccessOrigin;
}

export interface LoginResult {
  response: LightMyRequestResponse;
  cookie: string;
  me: AuthMe;
}

export async function login(app: FastifyInstance, input: LoginInput): Promise<LoginResult> {
  const { origin, ...body } = input;
  const response = await request(app, 'POST', '/api/v1/auth/login', {
    body,
    ...(origin ? { origin } : {}),
  });
  return {
    response,
    cookie: sessionCookie(response) ?? '',
    me: response.statusCode === 200 ? response.json<AuthMe>() : ({} as AuthMe),
  };
}

/** Logs in and fails loudly when it does not work, so scenarios stay readable. */
export async function loginOk(app: FastifyInstance, input: LoginInput): Promise<LoginResult> {
  const result = await login(app, input);
  if (result.response.statusCode !== 200) {
    throw new Error(`login failed (${result.response.statusCode}): ${result.response.body}`);
  }
  return result;
}

export async function auditActions(db: Db, entityId?: string): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    where: entityId ? { entityId } : {},
    orderBy: { id: 'asc' },
    select: { action: true },
  });
  return rows.map((row) => row.action);
}

/** Actions with their reason, in order: what a reviewer of the audit log would read. */
export async function auditEntries(db: Db): Promise<[string, string | null][]> {
  const rows = await db.auditLog.findMany({
    orderBy: { id: 'asc' },
    select: { action: true, reason: true },
  });
  return rows.map((row) => [row.action, row.reason]);
}

/** Resolves once a backend of the test database waits on a lock: a request is held up. */
export async function someoneWaits(db: Db): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await db.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS "waiting" FROM pg_stat_activity
      WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`;
    if (row && row.waiting > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('nobody waits on a lock');
}
