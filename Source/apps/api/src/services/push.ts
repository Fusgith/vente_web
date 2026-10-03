import type { Db } from '../db.js';
import { Prisma } from '../generated/prisma/client.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';

/** Devices kept per user: a phone changed many times does not pile up. */
export const MAX_DEVICES = 10;

/** Where a notification goes: the browser's push service, and the keys it is encrypted with. */
export interface PushTarget {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const targetOf = (row: {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): PushTarget => ({
  id: row.id,
  endpoint: row.endpoint,
  keys: { p256dh: row.p256dh, auth: row.auth },
});

/**
 * This device now tells its user (T-033e, ⚠️ H55): one subscription per device, its keys renewed
 * as the browser gives them. A device that told someone else now tells this user — the phone
 * changed hands. Beyond `MAX_DEVICES`, the device seen the least recently stops. The endpoint and
 * keys are never audited: the endpoint lets anyone write to the device.
 */
export async function saveSubscription(db: Db, actor: Actor, input: Subscription): Promise<void> {
  try {
    await saveOnce(db, actor, input);
  } catch (error) {
    // The same device saved twice at once: the second finds the first's row.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    await saveOnce(db, actor, input);
  }
}

async function saveOnce(db: Db, actor: Actor, { endpoint, keys }: Subscription): Promise<void> {
  await db.$transaction(async (tx) => {
    const known = await tx.pushSubscription.findUnique({ where: { endpoint } });
    if (known?.userId === actor.userId) {
      // Seen again: the keys refreshed, the device kept among the most recent.
      await tx.pushSubscription.update({
        where: { id: known.id },
        data: { p256dh: keys.p256dh, auth: keys.auth, updatedAt: new Date() },
      });
      return;
    }
    const saved = known
      ? await tx.pushSubscription.update({
          where: { id: known.id },
          data: { userId: actor.userId, p256dh: keys.p256dh, auth: keys.auth },
        })
      : await tx.pushSubscription.create({
          data: { userId: actor.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        });
    await recordAudit(tx, {
      ...by(actor),
      action: 'push_subscription.created',
      entityType: 'push_subscription',
      entityId: saved.id,
      ...(known ? { before: { userId: known.userId } } : {}),
      after: { userId: actor.userId },
    });
    const beyond = await tx.pushSubscription.findMany({
      where: { userId: actor.userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: MAX_DEVICES,
      select: { id: true },
    });
    for (const { id } of beyond) {
      await tx.pushSubscription.delete({ where: { id } });
      await recordAudit(tx, {
        ...by(actor),
        action: 'push_subscription.deleted',
        entityType: 'push_subscription',
        entityId: id,
        before: { userId: actor.userId },
        reason: 'limit',
      });
    }
  });
}

/** This device stops telling its user; already stopped, nothing to do. */
export async function deleteSubscription(db: Db, actor: Actor, endpoint: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const known = await tx.pushSubscription.findFirst({
      where: { endpoint, userId: actor.userId },
    });
    if (!known) return;
    await tx.pushSubscription.delete({ where: { id: known.id } });
    await recordAudit(tx, {
      ...by(actor),
      action: 'push_subscription.deleted',
      entityType: 'push_subscription',
      entityId: known.id,
      before: { userId: actor.userId },
    });
  });
}

/** The caller's own device, by its endpoint. */
export async function findSubscription(
  db: Db,
  userId: string,
  endpoint: string,
): Promise<PushTarget | null> {
  const row = await db.pushSubscription.findFirst({ where: { endpoint, userId } });
  return row ? targetOf(row) : null;
}

/**
 * The devices of the owners (RG-DSH-05): an account deactivated or no longer owner is told
 * nothing, though its devices stay until turned off (⚠️ H55).
 */
export async function ownerTargets(db: Db): Promise<PushTarget[]> {
  const rows = await db.pushSubscription.findMany({
    where: { user: { isActive: true, roles: { has: 'owner' } } },
    orderBy: { id: 'asc' },
  });
  return rows.map(targetOf);
}

/**
 * The push service says the device is gone (404, 410: the browser unsubscribed, the app was
 * removed): it is forgotten, as the system's doing.
 */
export async function forgetGone(db: Db, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const gone = await tx.pushSubscription.findUnique({ where: { id } });
    if (!gone) return;
    await tx.pushSubscription.delete({ where: { id } });
    await recordAudit(tx, {
      action: 'push_subscription.deleted',
      entityType: 'push_subscription',
      entityId: id,
      before: { userId: gone.userId },
      reason: 'gone',
    });
  });
}
