import {
  CUSTOMER_NAME_MIN_LENGTH,
  CUSTOMER_SEARCH_MAX_RESULTS,
  phoneSearchDigits,
  searchTokens,
  type Customer,
  type CustomerCreate,
  type CustomerPhoneTaken,
  type CustomerSearchResult,
  type CustomerUpdate,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';

const CUSTOMER_FIELDS = {
  id: true,
  name: true,
  phone: true,
  secondPhone: true,
  isActive: true,
  mergedIntoId: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * The active record already holding one of `phones`, as its first or second number, with that
 * number: offered instead of a duplicate (RG-DEV-04, decision H26).
 */
async function phoneOwner(
  db: Db,
  phones: readonly string[],
  exceptId?: string,
): Promise<CustomerPhoneTaken | null> {
  if (phones.length === 0) return null;
  const customer = await db.customer.findFirst({
    where: {
      isActive: true,
      OR: [{ phone: { in: [...phones] } }, { secondPhone: { in: [...phones] } }],
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: CUSTOMER_FIELDS,
  });
  const phone = phones.find((candidate) =>
    [customer?.phone, customer?.secondPhone].includes(candidate),
  );
  return customer && phone ? { customer, phone } : null;
}

async function phoneTaken(db: Db, phones: readonly string[], exceptId?: string) {
  const taken = await phoneOwner(db, phones, exceptId);
  return new AppError(409, 'CUSTOMER_PHONE_TAKEN', taken ?? undefined);
}

export async function findCustomer(db: Db, id: string): Promise<Customer> {
  const customer = await db.customer.findUnique({ where: { id }, select: CUSTOMER_FIELDS });
  if (!customer) throw new AppError(404, 'NOT_FOUND');
  return customer;
}

/**
 * Active customers by phone digits anywhere in the number (`034 12`, `345 67`), or by word
 * prefixes of the name, any order, case and accents ignored (same `search_normalize` as the
 * catalog). An exact phone comes first, then names in alphabetical order.
 */
export async function searchCustomers(db: Db, term: string): Promise<CustomerSearchResult> {
  const digits = phoneSearchDigits(term);
  const tokens = term.length >= CUSTOMER_NAME_MIN_LENGTH ? searchTokens(term) : [];
  if (digits === null && tokens.length === 0) return { items: [], more: false };
  // Digits and tokens hold letters and digits only: they never inject LIKE wildcards.
  const match =
    digits === null
      ? Prisma.join(
          tokens.map(
            (token) =>
              Prisma.sql`(' ' || search_normalize(c."name")) LIKE '% ' || search_normalize(${token}) || '%'`,
          ),
          ' AND ',
        )
      : Prisma.sql`(replace(c."phone", '+', '') LIKE '%' || ${digits} || '%'
           OR replace(coalesce(c."second_phone", ''), '+', '') LIKE '%' || ${digits} || '%')`;
  const exact = digits ?? '';
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT c."id"
      FROM "customers" c
     WHERE c."is_active" AND ${match}
     ORDER BY (replace(c."phone", '+', '') = ${exact}
               OR replace(coalesce(c."second_phone", ''), '+', '') = ${exact}) DESC,
              lower(c."name"), c."id"
     LIMIT ${CUSTOMER_SEARCH_MAX_RESULTS + 1}`;
  const ids = rows.slice(0, CUSTOMER_SEARCH_MAX_RESULTS).map((row) => row.id);
  const found = await db.customer.findMany({ where: { id: { in: ids } }, select: CUSTOMER_FIELDS });
  const byId = new Map(found.map((customer) => [customer.id, customer]));
  return {
    items: ids.flatMap((id) => byId.get(id) ?? []),
    more: rows.length > CUSTOMER_SEARCH_MAX_RESULTS,
  };
}

const phonesOf = (customer: { phone: string; secondPhone?: string | null | undefined }) =>
  customer.secondPhone ? [customer.phone, customer.secondPhone] : [customer.phone];

/** A known phone is refused with the existing record, for the screen to offer it (RG-DEV-04). */
export async function createCustomer(
  db: Db,
  actor: Actor,
  input: CustomerCreate,
): Promise<Customer> {
  const phones = phonesOf(input);
  if (await phoneOwner(db, phones)) throw await phoneTaken(db, phones);
  const data = { name: input.name, phone: input.phone, secondPhone: input.secondPhone ?? null };
  try {
    return await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data, select: CUSTOMER_FIELDS });
      await recordAudit(tx, {
        ...by(actor),
        action: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        after: { name: customer.name, phone: customer.phone, secondPhone: customer.secondPhone },
      });
      return customer;
    });
  } catch (error) {
    // Two tablets creating the same number at once: the `customer_phones` key decides.
    if (isUniqueViolation(error)) throw await phoneTaken(db, phones);
    throw error;
  }
}

/**
 * Name and/or phones of an active record (`secondPhone: null` removes the second number); the
 * audit keeps only the fields that changed.
 */
export async function updateCustomer(
  db: Db,
  actor: Actor,
  id: string,
  input: CustomerUpdate,
): Promise<Customer> {
  const current = await findCustomer(db, id);
  if (!current.isActive) throw new AppError(409, 'CUSTOMER_INACTIVE');
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  for (const field of ['name', 'phone', 'secondPhone'] as const) {
    const value = input[field];
    if (value !== undefined && value !== current[field]) {
      before[field] = current[field];
      after[field] = value;
    }
  }
  if (Object.keys(after).length === 0) return current;
  const next = { ...current, ...after } as Customer;
  if (next.secondPhone === next.phone) throw new AppError(400, 'CUSTOMER_PHONES_SAME');
  const added = phonesOf(next).filter((phone) => !phonesOf(current).includes(phone));
  if (await phoneOwner(db, added, id)) throw await phoneTaken(db, added, id);
  try {
    return await db.$transaction(async (tx) => {
      // Guarded on is_active: a merge committed meanwhile wins, this edit is refused.
      const { count } = await tx.customer.updateMany({
        where: { id, isActive: true },
        data: after,
      });
      if (count === 0) throw new AppError(409, 'CUSTOMER_INACTIVE');
      await recordAudit(tx, {
        ...by(actor),
        action: 'customer.updated',
        entityType: 'customer',
        entityId: id,
        before,
        after,
      });
      return next;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw await phoneTaken(db, added, id);
    throw error;
  }
}

/** A customer is never deleted: the manager deactivates it (RG-DEV-04); its history stays. */
export async function deactivateCustomer(db: Db, actor: Actor, id: string): Promise<void> {
  await findCustomer(db, id);
  await db.$transaction(async (tx) => {
    const { count } = await tx.customer.updateMany({
      where: { id, isActive: true },
      data: { isActive: false },
    });
    if (count === 0) throw new AppError(409, 'CUSTOMER_INACTIVE');
    await recordAudit(tx, {
      ...by(actor),
      action: 'customer.deactivated',
      entityType: 'customer',
      entityId: id,
      before: { isActive: true },
      after: { isActive: false },
    });
  });
}

/**
 * Merges the duplicate `id` into `intoId` (RG-DEV-04): the duplicate is deactivated and points
 * to the record that replaces it. Its quotes, orders and invoices keep it (an invoice is frozen,
 * RG-FAC-02); the customer's history gathers the merged records.
 */
export async function mergeCustomer(
  db: Db,
  actor: Actor,
  id: string,
  intoId: string,
): Promise<void> {
  if (id === intoId) throw new AppError(409, 'CUSTOMER_MERGE_INVALID');
  await db.$transaction(async (tx) => {
    // Both rows locked in one order: two opposite merges cannot both pass and form a cycle.
    const rows = await tx.$queryRaw<{ id: string; is_active: boolean }[]>`
      SELECT "id", "is_active" FROM "customers"
       WHERE "id" IN (${id}::uuid, ${intoId}::uuid)
       ORDER BY "id" FOR UPDATE`;
    if (rows.length < 2) throw new AppError(404, 'NOT_FOUND');
    if (!rows.every((row) => row.is_active)) throw new AppError(409, 'CUSTOMER_MERGE_INVALID');
    await tx.customer.update({ where: { id }, data: { isActive: false, mergedIntoId: intoId } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'customer.merged',
      entityType: 'customer',
      entityId: id,
      before: { isActive: true, mergedIntoId: null },
      after: { isActive: false, mergedIntoId: intoId },
    });
  });
}
