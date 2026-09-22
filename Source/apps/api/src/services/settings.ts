import type { Db } from '../db.js';

/** Settings change rarely: every reader shares one cache refreshed at most once a minute. */
const CACHE_TTL_MS = 60_000;

interface CachedValue {
  value: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CachedValue>();

/** Tests and admin updates call this after writing a setting. */
export function clearSettingsCache(): void {
  cache.clear();
}

export async function readSetting(db: Db, key: string): Promise<unknown> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.value;
  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
  const value = row?.value ?? undefined;
  cache.set(key, { value, fetchedAt: now });
  return value;
}

/** Positive integer setting with a fallback when unset or malformed. */
export async function readPositiveIntSetting(
  db: Db,
  key: string,
  fallback: number,
): Promise<number> {
  const value = await readSetting(db, key);
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}
