import {
  CUSTOMER_NAME_MIN_LENGTH,
  CUSTOMER_SEARCH_MAX_RESULTS,
  phoneSearchDigits,
  searchTokens,
  type Customer,
  type CustomerCreate,
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
  isActive: true,
  mergedIntoId: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** The active record holding `phone`, offered instead of a duplicate (RG-DEV-04). */
async function phoneOwner(db: Db, phone: string, exceptId?: string): Promise<Customer | null> {
  return db.customer.findFirst({
    where: { phone, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: CUSTOMER_FIELDS,
  });
}

async function phoneTaken(db: Db, phone: string, exceptId?: string): Promise<AppError> {
  const customer = await phoneOwner(db, phone, exceptId);
  return new AppError(409, 'CUSTOMER_PHONE_TAKEN', customer ? { customer } : undefined);
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
      : Prisma.sql`replace(c."phone", '+', '') LIKE '%' || ${digits} || '%'`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT c."id"
      FROM "customers" c
     WHERE c."is_active" AND ${match}
     ORDER BY (replace(c."phone", '+', '') = ${digits ?? ''}) DESC, lower(c."name"), c."id"
     LIMIT ${CUSTOMER_SEARCH_MAX_RESULTS + 1}`;
  const ids = rows.slice(0, CUSTOMER_SEARCH_MAX_RESULTS).map((row) => row.id);
  const found = await db.customer.findMany({ where: { id: { in: ids } }, select: CUSTOMER_FIELDS });
  const byId = new Map(found.map((customer) => [customer.id, customer]));
  return {
    items: ids.flatMap((id) => byId.get(id) ?? []),
    more: rows.length > CUSTOMER_SEARCH_MAX_RESULTS,
  };
}

/** A known phone is refused with the existing record, for the screen to offer it (RG-DEV-04). */
export async function createCustomer(
  db: Db,
  actor: Actor,
  input: CustomerCreate,
): Promise<Customer> {
  if (await phoneOwner(db, input.phone)) throw await phoneTaken(db, input.phone);
  try {
    return await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data: input, select: CUSTOMER_FIELDS });
      await recordAudit(tx, {
        ...by(actor),
        action: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        after: { name: customer.name, phone: customer.phone },
      });
      return customer;
    });
  } catch (error) {
    // Two tablets creating the same number at once: the partial unique index decides.
    if (isUniqueViolation(error)) throw await phoneTaken(db, input.phone);
    throw error;
  }
}

/** Name and/or phone of an active record; the audit keeps only the fields that changed. */
export async function updateCustomer(
  db: Db,
  actor: Actor,
  id: string,
  input: CustomerUpdate,
): Promise<Customer> {
  const current = await findCustomer(db, id);
  if (!current.isActive) throw new AppError(409, 'CUSTOMER_INACTIVE');
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const field of ['name', 'phone'] as const) {
    const value = input[field];
    if (value !== undefined && value !== current[field]) {
      before[field] = current[field];
      after[field] = value;
    }
  }
  if (Object.keys(after).length === 0) return current;
  if (after.phone && (await phoneOwner(db, after.phone, id)))
    throw await phoneTaken(db, after.phone, id);
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
      return { ...current, ...after };
    });
  } catch (error) {
    if (isUniqueViolation(error) && after.phone) throw await phoneTaken(db, after.phone, id);
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
