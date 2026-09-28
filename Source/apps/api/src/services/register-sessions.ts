import type { RegisterSession, RegisterSessionOpen, RegisterStation } from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit, type AuditTx } from './audit.js';

const SESSION_SELECT = {
  id: true,
  openedAt: true,
  openingFloat: true,
  station: { select: { id: true, name: true } },
} satisfies Prisma.RegisterSessionSelect;

type StoredSession = Prisma.RegisterSessionGetPayload<{ select: typeof SESSION_SELECT }>;

function toSession(session: StoredSession): RegisterSession {
  return {
    id: session.id,
    station: session.station,
    openedAt: session.openedAt.toISOString(),
    openingFloat: session.openingFloat.toFixed(2),
  };
}

/** The register session this person has open, if any: one at a time (RG-CAI-02). */
export async function openSessionOf(db: AuditTx, userId: string): Promise<RegisterSession | null> {
  const session = await db.registerSession.findFirst({
    where: { cashierId: userId, closedAt: null },
    select: SESSION_SELECT,
  });
  return session ? toSession(session) : null;
}

/** The active registers, each marked busy when someone else has it open (RG-CAI-01). */
export async function registerStations(db: Db, userId: string): Promise<RegisterStation[]> {
  const stations = await db.station.findMany({
    where: { type: 'REGISTER', isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      registerSessions: { where: { closedAt: null }, select: { cashierId: true } },
    },
  });
  return stations.map((station) => ({
    id: station.id,
    name: station.name,
    busy: station.registerSessions.some((session) => session.cashierId !== userId),
  }));
}

/**
 * Opens the caller's register session on a register, with the cash in the drawer (RG-CAI-01,
 * H32): one open session per person and per register, both held by partial unique indexes
 * whatever two screens do at once. Audited; its closing comes with T-054.
 */
export async function openSession(
  db: Db,
  actor: Actor,
  { stationId, openingFloat }: RegisterSessionOpen,
): Promise<RegisterSession> {
  const station = await db.station.findUnique({ where: { id: stationId } });
  if (!station?.isActive || station.type !== 'REGISTER') throw new AppError(409, 'STATION_INVALID');
  try {
    return await db.$transaction(async (tx) => {
      if (await openSessionOf(tx, actor.userId)) throw new AppError(409, 'REGISTER_SESSION_OPEN');
      const session = await tx.registerSession.create({
        data: { stationId, cashierId: actor.userId, openingFloat },
        select: SESSION_SELECT,
      });
      await recordAudit(tx, {
        ...by(actor),
        action: 'register_session.opened',
        entityType: 'register_session',
        entityId: session.id,
        after: { station: station.name, openingFloat: session.openingFloat.toFixed(2) },
      });
      return toSession(session);
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    // Lost a race: the person opened elsewhere meanwhile, or the register was taken.
    if (await openSessionOf(db, actor.userId)) throw new AppError(409, 'REGISTER_SESSION_OPEN');
    throw new AppError(409, 'REGISTER_STATION_BUSY');
  }
}
