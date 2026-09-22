import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { testDatabaseUrl } from './db.js';

const require = createRequire(import.meta.url);

/** Creates the test database when missing (the dev/CI role owns the server). */
async function ensureDatabase(testUrl: string): Promise<void> {
  const name = new URL(testUrl).pathname.slice(1);
  const admin = new URL(testUrl);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
  } finally {
    await client.end();
  }
}

/** Same migrations as production (`prisma migrate deploy`), on the test database only. */
function migrate(testUrl: string): void {
  const cli = require.resolve('prisma/build/index.js');
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd,
    env: { ...process.env, DATABASE_URL: testUrl },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`);
  }
}

export default async function setup(): Promise<void> {
  const testUrl = testDatabaseUrl();
  if (!testUrl) {
    console.warn('DATABASE_URL is not set: database tests will be skipped');
    return;
  }
  await ensureDatabase(testUrl);
  migrate(testUrl);
}
