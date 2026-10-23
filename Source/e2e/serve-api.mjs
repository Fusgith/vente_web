// The API of the end-to-end tests (T-083), started by playwright.config.ts: a fresh
// `<DATABASE_URL database>_e2e`, the production migrations, the demo seed, then the API itself.
// Never the dev database: only a name ending in `_e2e` is ever dropped.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = fileURLToPath(new URL('../apps/api/', import.meta.url));
const require = createRequire(join(api, 'package.json'));
const pg = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquant : les tests de bout en bout créent <base>_e2e à côté.');
  process.exit(1);
}
const url = new URL(process.env.DATABASE_URL);
url.pathname = `${url.pathname.replace(/_(test|e2e)$/, '')}_e2e`;
const name = url.pathname.slice(1);
if (!/^[\w-]+_e2e$/.test(name)) throw new Error(`Unexpected e2e database name: ${name}`);

const admin = new URL(url);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}"`);
} finally {
  await client.end();
}

const filesDir = join(tmpdir(), 'vente-web-e2e-files');
mkdirSync(filesDir, { recursive: true });
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  NODE_ENV: 'development',
  API_HOST: '127.0.0.1',
  API_PORT: process.env.E2E_API_PORT ?? '3100',
  // Vite's proxy adds no origin header: the tests stand inside the shop (RG-USR-04).
  AUTH_DEFAULT_ORIGIN: 'LAN',
  COOKIE_SECURE: 'false',
  FILES_DIR: filesDir,
  LOG_LEVEL: 'warn',
};

function step(args) {
  const result = spawnSync(process.execPath, args, { cwd: api, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

step([require.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
step(['--import', 'tsx', '--conditions=development', 'prisma/seed.ts']);

const server = spawn(
  process.execPath,
  ['--import', 'tsx', '--conditions=development', 'src/index.ts'],
  { cwd: api, env, stdio: 'inherit' },
);
server.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
