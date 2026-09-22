import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

export type Db = PrismaClient;

/**
 * One client per process, talking to the shop's PostgreSQL through the `pg` driver adapter
 * (Prisma 7 has no bundled engine). Money and quantities come back as Prisma `Decimal`;
 * never convert them to `number` before rounding (RG-FMT-01).
 *
 * Every connection speaks UTC: Prisma reads and writes timestamps without an offset, so a
 * server in Indian/Antananarivo would shift them by three hours against `now()` in raw SQL
 * (the lockout clock, RG-USR-05). Dates are displayed in the shop's timezone by the client.
 */
export function createDb(connectionString: string): Db {
  const adapter = new PrismaPg({ connectionString, options: '-c TimeZone=UTC' });
  return new PrismaClient({ adapter });
}
