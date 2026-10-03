import { isKnownPushService, type Order, type PushMessage } from '@vente-web/shared';
import fp from 'fastify-plugin';
import webpush from 'web-push';

import type { Env } from '../env.js';
import { AppError } from '../errors.js';
import { requestMessage, testMessage } from '../services/push-message.js';
import { findSubscription, forgetGone, ownerTargets, type PushTarget } from '../services/push.js';
import type { Vapid } from '../services/vapid.js';

/** Posts one encrypted notification; rejects with the push service's `statusCode` if refused. */
export type PushSend = (
  target: PushTarget,
  payload: string,
  options: PushOptions,
) => Promise<unknown>;

export interface PushOptions {
  /** Seconds the push service keeps it for a device offline. */
  ttl: number;
  /** A message still undelivered for the same request is replaced, not piled up (RFC 8030). */
  topic?: string;
}

export interface Push {
  /** The VAPID public key the browsers subscribe with; null: push is off. */
  publicKey: string | null;
  /**
   * Each owner's device told of the order's request (RG-DSH-05, RG-REM-03), in the background:
   * the request is made whatever comes of it.
   */
  notifyOwners(order: Order): void;
  /** One test notification to the caller's device, refused with why it did not go. */
  test(userId: string, endpoint: string): Promise<void>;
  /** The notifications under way, sent or failed (tests, closing). */
  flush(): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    push: Push;
  }
}

/** The push service forgot the device: the browser unsubscribed, the app was removed. */
const GONE = new Set([404, 410]);
/** A test is worth nothing later. */
const TEST_TTL = 60;
/** At most a day: a request expires at the end of the shop day (H54). */
const MAX_TTL = 86_400;
/** Each push service is waited for this long at most. */
const TIMEOUT_MS = 10_000;

const field = (error: unknown, name: string): unknown =>
  typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[name]
    : undefined;

/** Kept by the push service until the request expires, never more than a day. */
export function ttlUntil(expiresAt: string, now = Date.now()): number {
  const seconds = Math.floor((Date.parse(expiresAt) - now) / 1000);
  return Math.min(MAX_TTL, Math.max(TEST_TTL, seconds));
}

function webPushSend(vapid: Vapid): PushSend {
  return (target, payload, { ttl, topic }) =>
    webpush.sendNotification({ endpoint: target.endpoint, keys: target.keys }, payload, {
      vapidDetails: vapid,
      TTL: ttl,
      urgency: 'high',
      timeout: TIMEOUT_MS,
      ...(topic ? { topic } : {}),
    });
}

/**
 * Web Push to the owner's devices (T-033e, CDC technique §6.1): the payload is composed here, in
 * French, and encrypted for each device (RFC 8291) — the push service carries it unread. Without
 * VAPID keys push is off and the app works as before. A device's address never reaches the
 * logs: a failure is logged by subscription id and status.
 */
export const pushPlugin = fp<{ env: Env; send?: PushSend }>(
  async (app, { env, send }) => {
    const vapid = env.VAPID;
    if (!vapid && env.NODE_ENV === 'production') {
      app.log.warn('push notifications off: the VAPID variables are not set');
    }
    const deliver = send ?? (vapid ? webPushSend(vapid) : null);
    const pending = new Set<Promise<void>>();

    async function sendTo(target: PushTarget, message: PushMessage, options: PushOptions) {
      // Checked again before posting: the server only ever writes to a known push service.
      if (!deliver || !isKnownPushService(target.endpoint)) {
        app.log.warn({ subscriptionId: target.id }, 'push notification not sent');
        return 'failed' as const;
      }
      try {
        await deliver(target, JSON.stringify(message), options);
        return 'sent' as const;
      } catch (error) {
        const statusCode = field(error, 'statusCode');
        if (typeof statusCode === 'number' && GONE.has(statusCode)) {
          await forgetGone(app.db, target.id);
          app.log.info({ subscriptionId: target.id, statusCode }, 'push subscription gone');
          return 'gone' as const;
        }
        app.log.warn(
          { subscriptionId: target.id, statusCode, code: field(error, 'code') },
          'push notification failed',
        );
        return 'failed' as const;
      }
    }

    function track(work: () => Promise<void>): void {
      const running: Promise<void> = work()
        .catch((error: unknown) => app.log.error({ err: error }, 'push notifications failed'))
        .finally(() => pending.delete(running));
      pending.add(running);
    }

    function notifyOwners(order: Order): void {
      const request = order.discountRequest;
      const message = requestMessage(order);
      if (!vapid || !request || !message) return;
      const options = { ttl: ttlUntil(request.expiresAt), topic: request.id.replaceAll('-', '') };
      track(async () => {
        const targets = await ownerTargets(app.db);
        await Promise.all(targets.map((target) => sendTo(target, message, options)));
      });
    }

    async function test(userId: string, endpoint: string): Promise<void> {
      if (!vapid) throw new AppError(503, 'PUSH_NOT_CONFIGURED');
      const target = await findSubscription(app.db, userId, endpoint);
      if (!target) throw new AppError(404, 'PUSH_SUBSCRIPTION_UNKNOWN');
      const outcome = await sendTo(target, testMessage(), { ttl: TEST_TTL });
      if (outcome === 'gone') throw new AppError(410, 'PUSH_SUBSCRIPTION_GONE');
      if (outcome === 'failed') throw new AppError(502, 'PUSH_SEND_FAILED');
    }

    async function flush(): Promise<void> {
      while (pending.size > 0) await Promise.allSettled([...pending]);
    }

    app.decorate('push', {
      publicKey: vapid?.publicKey ?? null,
      notifyOwners,
      test,
      flush,
    } satisfies Push);
    app.addHook('preClose', flush);
  },
  { name: 'push', dependencies: ['db'] },
);
