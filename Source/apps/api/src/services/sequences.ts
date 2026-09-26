import type { Prisma } from '../generated/prisma/client.js';

/**
 * Next value of a counter of `number_sequences` (1 the first time), taken inside the caller's
 * transaction: the row lock serialises two callers, and a rolled-back transaction gives its
 * value back. Quote numbers, tickets and the queue order use it; invoice numbers, which must
 * never skip (RG-FAC-01), will too, with their own test of concurrency (T-052).
 */
export async function nextSequenceValue(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<number> {
  const [row] = await tx.$queryRaw<{ next_value: number }[]>`
    INSERT INTO "number_sequences" ("key", "next_value") VALUES (${key}, 2)
    ON CONFLICT ("key") DO UPDATE SET "next_value" = "number_sequences"."next_value" + 1
    RETURNING "next_value"`;
  if (!row) throw new Error('number_sequences returned no row');
  return row.next_value - 1;
}
