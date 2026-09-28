import fp from 'fastify-plugin';

import { expireOrders, SWEEP_MS, type ExpiredOrder } from '../services/expiry.js';
import { orderExpired } from '../services/realtime-rooms.js';

export interface Expiry {
  /** One sweep now: the orders it expired, their followers told once it committed. */
  sweep(): Promise<ExpiredOrder[]>;
}

declare module 'fastify' {
  interface FastifyInstance {
    expiry: Expiry;
  }
}

/**
 * The internal task that expires the orders past their day end (RG-CMD-08), every `sweepMs` and
 * once at start — orders left from a day the server was off expire at once. No separate service
 * (CDC technique §5); `sweepMs: 0` leaves the sweeps to the caller (tests).
 */
export const expiryPlugin = fp<{ sweepMs?: number }>(
  async (app, { sweepMs = SWEEP_MS }) => {
    let running: Promise<ExpiredOrder[]> | null = null;
    async function run(): Promise<ExpiredOrder[]> {
      const expired = await expireOrders(app.db, (orderId, error) =>
        app.log.error({ err: error, orderId }, 'order expiry failed'),
      );
      app.realtime.publish(expired.flatMap(orderExpired));
      if (expired.length > 0) app.log.info({ count: expired.length }, 'orders expired');
      return expired;
    }
    // One sweep at a time: a slow one is joined, never doubled.
    function sweep(): Promise<ExpiredOrder[]> {
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    }
    app.decorate('expiry', { sweep } satisfies Expiry);
    if (sweepMs <= 0) return;

    const tick = () => void sweep().catch((error: unknown) => app.log.error(error));
    const timer = setInterval(tick, sweepMs);
    timer.unref();
    app.addHook('onReady', async () => tick());
    app.addHook('preClose', async () => {
      clearInterval(timer);
      await running?.catch(() => undefined);
    });
  },
  { name: 'expiry', dependencies: ['db', 'realtime'] },
);
