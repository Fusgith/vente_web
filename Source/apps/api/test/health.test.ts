import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { TEST_DATABASE_URL } from './db.js';

const folder = mkdtempSync(join(tmpdir(), 'vw-health-'));
const statusFile = join(folder, 'derniere-sauvegarde.txt');

async function appOn(databaseUrl: string): Promise<FastifyInstance> {
  const app = await buildApp({
    env: loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      FILES_DIR: folder,
      BACKUP_STATUS_FILE: statusFile,
    }),
    fastify: { logger: false },
    expiry: { sweepMs: 0 },
  });
  await app.ready();
  return app;
}

describe.skipIf(!TEST_DATABASE_URL)('GET /healthz (T-082)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await appOn(TEST_DATABASE_URL ?? '');
  });
  afterAll(() => app.close());

  it('answers 200 with the database, the free disk space and the last backup', async () => {
    writeFileSync(statusFile, '2026-10-23T08:15:00.000Z\n');
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      version: expect.any(String),
      database: 'ok',
      diskFreePercent: expect.any(Number),
      lastBackupAt: '2026-10-23T08:15:00.000Z',
    });
  });
});

describe('GET /healthz without a database (T-082)', () => {
  let app: FastifyInstance;

  // Nothing listens on port 1: the connection is refused at once.
  beforeAll(async () => {
    app = await appOn('postgresql://vente:vente@127.0.0.1:1/vente_web_test');
  });
  afterAll(() => app.close());

  it('answers 503 so that the relay raises an alert', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'error', database: 'error' });
  });
});
