import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigrations, grantApiRole } from '../src/cli/migrate.js';
import { TEST_DATABASE_URL } from './db.js';

const ROLE = 'vente_web_api_probe';

/** A URL to another database of the test server. */
function databaseUrl(name: string): string {
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${name}`;
  return url.toString();
}

const FRESH = TEST_DATABASE_URL ? `${new URL(TEST_DATABASE_URL).pathname.slice(1)}_runner` : '';

describe.skipIf(!TEST_DATABASE_URL)('migration runner of the shop bundle (T-080)', () => {
  const server = () => new pg.Client({ connectionString: databaseUrl('postgres') });
  let fresh: pg.Client;

  beforeAll(async () => {
    const admin = server();
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${FRESH}"`);
    await admin.query(`CREATE DATABASE "${FRESH}"`);
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin.query(`CREATE ROLE ${ROLE} NOLOGIN`);
    await admin.end();
    fresh = new pg.Client({ connectionString: databaseUrl(FRESH) });
    await fresh.connect();
  });

  afterAll(async () => {
    await fresh?.end();
    const admin = server();
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${FRESH}"`);
    await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await admin.end();
  });

  it('applies every migration once, with the checksums Prisma writes', async () => {
    const ran = await applyMigrations(fresh);
    expect(ran.length).toBeGreaterThan(20);
    expect(await applyMigrations(fresh)).toEqual([]);

    const byPrisma = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await byPrisma.connect();
    const sql = 'SELECT migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name';
    const [ours, theirs] = [(await fresh.query(sql)).rows, (await byPrisma.query(sql)).rows];
    await byPrisma.end();
    expect(ours).toEqual(theirs);

    const methods = await fresh.query('SELECT code FROM payment_methods ORDER BY sort_order');
    expect(methods.rows.map((row: { code: string }) => row.code)).toEqual([
      'CASH',
      'MVOLA',
      'ORANGE_MONEY',
      'AIRTEL_MONEY',
      'CARD',
      'TRANSFER',
      'CHEQUE',
      'CREDIT',
      'BILL_OF_EXCHANGE',
      'POSTDATED_CHECK',
    ]);
  });

  it('lets the API role write, never rewrite the audit, payments or invoices (RG-AUD-01)', async () => {
    await grantApiRole(fresh, ROLE);
    const can = async (table: string, right: string) =>
      (
        await fresh.query<{ ok: boolean }>('SELECT has_table_privilege($1, $2, $3) AS ok', [
          ROLE,
          table,
          right,
        ])
      ).rows[0]!.ok;

    expect(await can('audit_log', 'INSERT')).toBe(true);
    expect(await can('audit_log', 'UPDATE')).toBe(false);
    expect(await can('payments', 'DELETE')).toBe(false);
    expect(await can('invoices', 'UPDATE')).toBe(true);
    expect(await can('invoices', 'DELETE')).toBe(false);
    expect(await can('orders', 'DELETE')).toBe(true);
    expect(await can('_prisma_migrations', 'SELECT')).toBe(false);
  });
});
