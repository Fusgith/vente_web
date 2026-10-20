import { createHash, randomBytes } from 'node:crypto';

import type {
  CreateStation,
  Station,
  StationPairing,
  StationType,
  UpdateStation,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';

const select = {
  id: true,
  type: true,
  name: true,
  isActive: true,
  displayKey: true,
  pairedAt: true,
} satisfies Prisma.StationSelect;
type StoredStation = Prisma.StationGetPayload<{ select: typeof select }>;

function toView(row: StoredStation): Station {
  return { ...row, pairedAt: row.pairedAt?.toISOString() ?? null };
}

/** What the audit keeps of a station: never its keys (RG-AUD-01). */
const audited = (station: Station) => ({
  type: station.type,
  name: station.name,
  isActive: station.isActive,
});

/** A random key, the URL-safe way: a display key goes in `/ecran/<key>`. */
const newKey = () => randomBytes(24).toString('base64url');

/** Only the SHA-256 of a pairing key is stored: a database dump pairs no device. */
export const hashPairingKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** The partial index `stations_single_active_display_key` allows one active display (H29). */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function write<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, 'STATION_DISPLAY_EXISTS');
    throw error;
  }
}

/** The public display and the kiosks open by their address key, without pairing (RG-BOR-01). */
const opensByAddress = (type: StationType) => type === 'DISPLAY' || type === 'KIOSK';

/** Every station, by type then name (T-015). */
export async function listStations(db: Db): Promise<Station[]> {
  const rows = await db.station.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }], select });
  return rows.map(toView);
}

export async function createStation(db: Db, actor: Actor, input: CreateStation): Promise<Station> {
  return write(() =>
    db.$transaction(async (tx) => {
      const row = await tx.station.create({
        data: { ...input, displayKey: opensByAddress(input.type) ? newKey() : null },
        select,
      });
      const station = toView(row);
      await recordAudit(tx, {
        ...by(actor),
        action: 'station.created',
        entityType: 'station',
        entityId: station.id,
        after: audited(station),
      });
      return station;
    }),
  );
}

export async function updateStation(
  db: Db,
  actor: Actor,
  id: string,
  input: UpdateStation,
): Promise<Station> {
  return write(() =>
    db.$transaction(async (tx) => {
      const current = await tx.station.findUnique({ where: { id }, select });
      if (!current) throw new AppError(404, 'NOT_FOUND');
      const data = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      };
      const station = toView(await tx.station.update({ where: { id }, data, select }));
      await recordAudit(tx, {
        ...by(actor),
        action: 'station.updated',
        entityType: 'station',
        entityId: id,
        before: audited(toView(current)),
        after: audited(station),
      });
      return station;
    }),
  );
}

/**
 * Pairs the device the admin is on to the station (T-015, H71): a new key replaces the previous
 * one, so the station has one device at a time. The display opens by its address instead.
 */
export async function pairStation(db: Db, actor: Actor, id: string): Promise<StationPairing> {
  return db.$transaction(async (tx) => {
    const current = await tx.station.findUnique({ where: { id }, select });
    if (!current) throw new AppError(404, 'NOT_FOUND');
    if (opensByAddress(current.type)) throw new AppError(400, 'STATION_NOT_PAIRABLE');
    if (!current.isActive) throw new AppError(400, 'STATION_INVALID');
    const key = newKey();
    const row = await tx.station.update({
      where: { id },
      data: { pairingHash: hashPairingKey(key), pairedAt: new Date() },
      select,
    });
    const station = toView(row);
    await recordAudit(tx, {
      ...by(actor),
      action: 'station.paired',
      entityType: 'station',
      entityId: id,
      before: { pairedAt: toView(current).pairedAt },
      after: { pairedAt: station.pairedAt },
    });
    return { station, key };
  });
}

export interface PairedStation {
  id: string;
  type: StationType;
}

/** The active station a device's key designates; null for no key, an unknown or a stale one. */
export async function stationOfKey(
  db: AuditTx,
  key: string | undefined,
): Promise<PairedStation | null> {
  if (!key) return null;
  const station = await db.station.findUnique({
    where: { pairingHash: hashPairingKey(key) },
    select: { id: true, type: true, isActive: true },
  });
  return station?.isActive ? { id: station.id, type: station.type } : null;
}

/**
 * In the shop, once the admin has paired a first device, every other device must be paired too:
 * only the remote roles (admin, owner) log in elsewhere (RG-USR-09, H71). Before that, the shop
 * keeps working as installed.
 */
export async function pairingRequired(db: AuditTx): Promise<boolean> {
  const paired = await db.station.count({
    where: { isActive: true, pairingHash: { not: null } },
  });
  return paired > 0;
}
