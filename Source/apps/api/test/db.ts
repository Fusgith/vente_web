import { createDb, type Db } from '../src/db.js';

/**
 * Database tests run against `<DATABASE_URL database>_test`, created and migrated by
 * `global-setup.ts`. Without DATABASE_URL those suites are skipped (`describe.skipIf`).
 */
export function testDatabaseUrl(): string | undefined {
  const base = process.env['DATABASE_URL'];
  if (!base) return undefined;
  const url = new URL(base);
  if (!url.pathname.endsWith('_test')) url.pathname = `${url.pathname}_test`;
  return url.toString();
}

export const TEST_DATABASE_URL = testDatabaseUrl();

export function createTestDb(): Db {
  if (!TEST_DATABASE_URL) throw new Error('DATABASE_URL is not set: database tests need it');
  return createDb(TEST_DATABASE_URL);
}

/**
 * Empties users, stations, the catalog and the number sequences, and through CASCADE everything
 * that references them (prices, stock, orders…); `audit_log` and `product_prices` only forbid
 * UPDATE/DELETE, not TRUNCATE.
 */
export async function resetDb(db: Db): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE users, stations, sessions, audit_log, settings, categories, products, customers, number_sequences RESTART IDENTITY CASCADE',
  );
}
