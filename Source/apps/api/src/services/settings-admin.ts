import { SETTING_KEYS, SETTING_SCHEMAS, type SettingKey, type Settings } from '@vente-web/shared';

import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { clearSettingsCache } from './settings.js';

/** The values of the « Paramètres » screen (CDC métier §13, T-013); null while never set. */
export async function listSettings(db: Db): Promise<Settings> {
  const rows = await db.setting.findMany({
    where: { key: { in: SETTING_KEYS } },
    select: { key: true, value: true },
  });
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return {
    values: Object.fromEntries(
      SETTING_KEYS.map((key) => [key, stored.get(key) ?? null]),
    ) as Settings['values'],
  };
}

/** Sets one setting, checked against its schema, by the admin, audited (RG-AUD-01). */
export async function writeSetting(
  db: Db,
  actor: Actor,
  key: SettingKey,
  input: unknown,
): Promise<void> {
  const value = SETTING_SCHEMAS[key].parse(input) as Prisma.InputJsonValue;
  await db.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { key }, select: { value: true } });
    const before = (row?.value ?? null) as Prisma.InputJsonValue | null;
    if (JSON.stringify(before) === JSON.stringify(value)) return;
    await tx.setting.upsert({
      where: { key },
      create: { key, value, updatedById: actor.userId },
      update: { value, updatedById: actor.userId },
    });
    await recordAudit(tx, {
      ...by(actor),
      action: 'setting.update',
      entityType: 'setting',
      entityId: key,
      before: { value: before },
      after: { value },
    });
  });
  clearSettingsCache();
}
