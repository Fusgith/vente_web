import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { clearSettingsCache, readSetting } from './settings.js';

const KEY = 'sales_discount_enabled';

/** Whether the salesperson discounts (H60): only an explicit `true` turns it on. */
export async function salesDiscountEnabled(db: Db): Promise<boolean> {
  return (await readSetting(db, KEY)) === true;
}

/** Turns the salesperson's discounts on or off, by the admin, audited (RG-AUD-01). */
export async function setSalesDiscount(db: Db, actor: Actor, enabled: boolean): Promise<void> {
  const before = await salesDiscountEnabled(db);
  if (before === enabled) return;
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: enabled, updatedById: actor.userId },
      update: { value: enabled, updatedById: actor.userId },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'sales_discount.set',
      entityType: 'setting',
      entityId: KEY,
      before: { enabled: before },
      after: { enabled },
    });
  });
  clearSettingsCache();
}

/** A salesperson discounts, or asks the owner for a discount, only when the admin allows it (H60). */
export async function assertSalesDiscount(db: Db, actor: Actor): Promise<void> {
  if (actor.activeRole === 'sales' && !(await salesDiscountEnabled(db)))
    throw new AppError(403, 'SALES_DISCOUNT_DISABLED');
}
