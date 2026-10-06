import { reservationDaysSchema, type ReservationDays } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { clearSettingsCache, readSetting } from './settings.js';

const KEY = 'reservation_days';

/** The general duration (RG-STK-02, H45): 0 — the day itself — when unset or malformed. */
export async function generalReservationDays(db: Db): Promise<number> {
  const parsed = reservationDaysSchema.safeParse(await readSetting(db, KEY));
  return parsed.success ? parsed.data : 0;
}

/** How many days after its own an order of this customer stays reserved: theirs first (H45). */
export async function reservationDaysOf(db: Db, customerId: string): Promise<number> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { reservationDays: true },
  });
  return customer?.reservationDays ?? (await generalReservationDays(db));
}

/** The general duration and the active customers who have their own. */
export async function reservationDays(db: Db): Promise<ReservationDays> {
  const [days, customers] = await Promise.all([
    generalReservationDays(db),
    db.customer.findMany({
      where: { reservationDays: { not: null }, isActive: true },
      select: { id: true, name: true, phone: true, reservationDays: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return {
    days,
    customers: customers.flatMap(({ reservationDays: own, ...customer }) =>
      own === null ? [] : [{ ...customer, days: own }],
    ),
  };
}

/** The general duration, set by the admin or the owner, audited (RG-STK-02, RG-AUD-01). */
export async function setGeneralReservationDays(db: Db, actor: Actor, days: number): Promise<void> {
  const before = await generalReservationDays(db);
  if (before === days) return;
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: days, updatedById: actor.userId },
      update: { value: days, updatedById: actor.userId },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'reservation_days.set',
      entityType: 'setting',
      entityId: KEY,
      before: { days: before },
      after: { days },
    });
  });
  clearSettingsCache();
}

/** A customer's own duration — null gives them the general one back —, audited. */
export async function setCustomerReservationDays(
  db: Db,
  actor: Actor,
  id: string,
  days: number | null,
): Promise<void> {
  const current = await db.customer.findUnique({
    where: { id },
    select: { isActive: true, reservationDays: true },
  });
  if (!current) throw new AppError(404, 'NOT_FOUND');
  if (!current.isActive) throw new AppError(409, 'CUSTOMER_INACTIVE');
  if (current.reservationDays === days) return;
  await db.$transaction(async (tx) => {
    const { count } = await tx.customer.updateMany({
      where: { id, isActive: true },
      data: { reservationDays: days },
    });
    if (count === 0) throw new AppError(409, 'CUSTOMER_INACTIVE');
    await recordAudit(tx, {
      ...by(actor),
      action: 'reservation_days.set',
      entityType: 'customer',
      entityId: id,
      before: { days: current.reservationDays },
      after: { days },
    });
  });
}
