// Applies the pending migrations, then sets the API role's rights (T-080, ADR-0007):
//   node --env-file=<data>\.env dist/cli/migrate.js
// The shop's bundle has no Prisma CLI: this runner fills Prisma's own `_prisma_migrations` table
// (same checksum, the SHA-256 of migration.sql), so `prisma migrate` and it always agree.
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));

/** Rows never change once written (their triggers already refuse it, RG-AUD-01). */
const INSERT_ONLY = ['audit_log', 'stock_movements', 'payments', 'payment_lines'];
/** Rows never deleted; a few columns may still change (RG-FAC-01, RG-FAC-05, RG-ART-07). */
const NEVER_DELETED = ['invoices', 'credit_notes', 'product_prices'];

const TRACKING_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

/**
 * Runs each migration not yet finished, in name order, as one script (one implicit
 * transaction, like Prisma). Stops at the first failure or at a changed applied migration.
 */
export async function applyMigrations(client: pg.Client, dir = MIGRATIONS_DIR): Promise<string[]> {
  await client.query(TRACKING_TABLE);
  const done = await client.query<{ migration_name: string; checksum: string }>(
    'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  const applied = new Map(done.rows.map((row) => [row.migration_name, row.checksum]));
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const ran: string[] = [];
  for (const name of names) {
    const sql = readFileSync(join(dir, name, 'migration.sql'));
    const checksum = createHash('sha256').update(sql).digest('hex');
    const known = applied.get(name);
    if (known !== undefined) {
      if (known !== checksum) throw new Error(`Migration ${name} was changed after it was applied`);
      continue;
    }
    const id = randomUUID();
    await client.query(
      'INSERT INTO "_prisma_migrations" (id, checksum, migration_name) VALUES ($1, $2, $3)',
      [id, checksum, name],
    );
    await client.query(sql.toString('utf8'));
    await client.query(
      'UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1',
      [id],
    );
    ran.push(name);
  }
  return ran;
}

/**
 * The API connects with its own role, which owns nothing: it reads and writes the tables but
 * cannot change or delete what must stay (CDC technique §5). Run again after every migration.
 */
export async function grantApiRole(client: pg.Client, role: string): Promise<void> {
  const who = client.escapeIdentifier(role);
  const tables = (names: string[]) => names.map((name) => client.escapeIdentifier(name)).join(', ');
  await client.query(`GRANT USAGE ON SCHEMA public TO ${who}`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${who}`,
  );
  await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${who}`);
  await client.query(`REVOKE ALL ON "_prisma_migrations" FROM ${who}`);
  await client.query(`REVOKE UPDATE, DELETE, TRUNCATE ON ${tables(INSERT_ONLY)} FROM ${who}`);
  await client.query(`REVOKE DELETE, TRUNCATE ON ${tables(NEVER_DELETED)} FROM ${who}`);
}

async function main(): Promise<number> {
  const apiUrl = process.env['DATABASE_URL'];
  const ownerUrl = process.env['MIGRATION_DATABASE_URL'] ?? apiUrl;
  if (!apiUrl || !ownerUrl) {
    console.error('DATABASE_URL manquant : renseignez-le dans le fichier .env.');
    return 1;
  }
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const ran = await applyMigrations(client);
    process.stdout.write(
      ran.length === 0
        ? 'Base à jour : aucune migration à appliquer.\n'
        : `Migrations appliquées : ${ran.length}.\n`,
    );
    const apiRole = decodeURIComponent(new URL(apiUrl).username);
    const ownerRole = decodeURIComponent(new URL(ownerUrl).username);
    if (apiRole !== ownerRole) await grantApiRole(client, apiRole);
    return 0;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
