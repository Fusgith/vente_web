import {
  isKnownPushService,
  pushEndpointSchema,
  pushSubscriptionSchema,
  type PushKey,
} from '@vente-web/shared';
import type { FastifyPluginAsync, RouteShorthandOptions } from 'fastify';

import { AppError } from '../errors.js';
import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { deleteSubscription, saveSubscription } from '../services/push.js';

/** The owner alone is told of the requests, on the devices they choose (RG-DSH-05). */
const owner = { preHandler: requireRole('owner') };
/** A test goes out to the Internet: a few per minute are enough. */
const TESTS_PER_MINUTE = 5;
const testLimit: RouteShorthandOptions = {
  ...owner,
  config: { rateLimit: { max: TESTS_PER_MINUTE, timeWindow: 60_000 } },
};

/** Push notifications to the owner's devices (T-033e, ⚠️ H55). */
export const pushRoutes: FastifyPluginAsync = async (app) => {
  app.get('/push/key', owner, async (): Promise<PushKey> => ({ publicKey: app.push.publicKey }));

  // This device tells the owner; the endpoint is posted to by the server, so only a known push
  // service's is kept.
  app.put('/push/subscription', owner, async (request, reply) => {
    if (!app.push.publicKey) throw new AppError(503, 'PUSH_NOT_CONFIGURED');
    const input = pushSubscriptionSchema.parse(request.body);
    if (!isKnownPushService(input.endpoint)) throw new AppError(422, 'PUSH_SERVICE_REFUSED');
    await saveSubscription(app.db, actorOf(authOf(request)), input);
    return reply.code(204).send();
  });

  app.delete('/push/subscription', owner, async (request, reply) => {
    const { endpoint } = pushEndpointSchema.parse(request.body);
    await deleteSubscription(app.db, actorOf(authOf(request)), endpoint);
    return reply.code(204).send();
  });

  app.post('/push/test', testLimit, async (request, reply) => {
    const { endpoint } = pushEndpointSchema.parse(request.body);
    await app.push.test(authOf(request).user.id, endpoint);
    return reply.code(204).send();
  });
};
