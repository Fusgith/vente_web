import { ticketLabel, type DisplayBoard, type DisplayCall } from '@vente-web/shared';

import type { Db } from '../db.js';
import { readPositiveIntSetting, readSetting } from './settings.js';
import { shopDayStart } from './shop-time.js';

/** RG-DSP-01: « les 5 derniers tickets appelés ». */
const LAST_CALLS = 5;

/**
 * The display station of `key`: declared, active, and the display on (`display.enabled`,
 * RG-DSP-01); null otherwise, whatever the reason, so a key cannot be probed.
 */
export async function findDisplay(db: Db, key: string): Promise<{ id: string } | null> {
  if ((await readSetting(db, 'display.enabled')) !== true) return null;
  return db.station.findFirst({
    where: { displayKey: key, type: 'DISPLAY', isActive: true },
    select: { id: true },
  });
}

type Called = {
  ticketLetter: string | null;
  ticketSeq: number | null;
};

function call(order: Called, station: string | null, at: Date): DisplayCall[] {
  if (!order.ticketLetter || !order.ticketSeq) return [];
  const ticket = ticketLabel({ letter: order.ticketLetter, seq: order.ticketSeq });
  return [{ ticket, station, calledAt: at.toISOString() }];
}

/**
 * The last tickets called today, per queue (RG-DSP-01): to a register (`called_at`) and to a
 * counter, ready to hand over (`ready_at`, RG-LIV-02).
 */
export async function loadBoard(db: Db, now = new Date()): Promise<DisplayBoard> {
  const take = await readPositiveIntSetting(db, 'display.last_calls', LAST_CALLS);
  const since = shopDayStart(now);
  const [registers, counters, sound] = await Promise.all([
    db.order.findMany({
      where: { calledAt: { gte: since } },
      orderBy: { calledAt: 'desc' },
      take,
      select: {
        ticketLetter: true,
        ticketSeq: true,
        calledAt: true,
        registerStation: { select: { name: true } },
      },
    }),
    db.delivery.findMany({
      where: { readyAt: { gte: since } },
      orderBy: { readyAt: 'desc' },
      take,
      select: {
        readyAt: true,
        station: { select: { name: true } },
        order: { select: { ticketLetter: true, ticketSeq: true } },
      },
    }),
    readSetting(db, 'display.sound'),
  ]);
  return {
    sound: sound !== false,
    register: registers.flatMap((order) =>
      order.calledAt ? call(order, order.registerStation?.name ?? null, order.calledAt) : [],
    ),
    delivery: counters.flatMap((delivery) =>
      delivery.readyAt
        ? call(delivery.order, delivery.station?.name ?? null, delivery.readyAt)
        : [],
    ),
  };
}
