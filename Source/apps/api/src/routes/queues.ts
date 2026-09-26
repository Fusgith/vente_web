import {
  queueMoveSchema,
  queueNameSchema,
  queuePrioritySchema,
  type Order,
  type Queue,
  type QueueName,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { actorOf, authOf, requireAuth, requireRole } from '../plugins/session.js';
import {
  callToRegister,
  loadQueue,
  markNoShow,
  moveInQueue,
  setPriority,
} from '../services/queues.js';
import { orderCalled, orderNoShow, queueChanged } from '../services/realtime-rooms.js';
import { readSetting } from '../services/settings.js';

const queueParams = z.object({ queue: queueNameSchema });
const orderParams = z.object({ id: z.uuid() });

/** Annexe B: those who call from a queue, the manager and the owner follow it (RG-DSP-04). */
const READERS: Record<QueueName, readonly Role[]> = {
  register: ['cashier', 'manager', 'owner'],
  delivery: ['warehouse', 'manager', 'owner'],
};
/** Annexe B « File caisse : appeler / absent ». */
const REGISTER_CALLERS: Role[] = ['cashier', 'manager'];

export const queueRoutes: FastifyPluginAsync = async (app) => {
  /** Without a public display, a call is verbal (RG-DSP-05, `display.enabled`). */
  const verbalCalls = async () => (await readSetting(app.db, 'display.enabled')) !== true;

  app.get('/queues/:queue', { preHandler: requireAuth }, async (request): Promise<Queue> => {
    const { queue } = queueParams.parse(request.params);
    if (!READERS[queue].includes(authOf(request).session.activeRole)) {
      throw new AppError(403, 'AUTH_FORBIDDEN');
    }
    return loadQueue(app.db, queue);
  });

  const called = async (order: Order) => {
    app.realtime.publish(
      orderCalled({ id: order.id, salesUserId: order.salesUser.id }, await verbalCalls()),
    );
    return order;
  };

  app.post(
    '/queues/register/call-next',
    { preHandler: requireRole(...REGISTER_CALLERS) },
    async (request): Promise<Order> =>
      called(await callToRegister(app.db, actorOf(authOf(request)), null)),
  );

  // A ticket called out of turn: the customer is in front of the cashier (RG-FIL-03).
  app.post(
    '/orders/:id/call',
    { preHandler: requireRole(...REGISTER_CALLERS) },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      return called(await callToRegister(app.db, actorOf(authOf(request)), id));
    },
  );

  app.post(
    '/orders/:id/no-show',
    { preHandler: requireRole(...REGISTER_CALLERS) },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const { order, noShowCount } = await markNoShow(app.db, actorOf(authOf(request)), id);
      app.realtime.publish(orderNoShow({ id, salesUserId: order.salesUser.id }, noShowCount));
      return order;
    },
  );

  // Annexe B « Files : réordonner, prioriser » — the manager alone (RG-FIL-02).
  app.post(
    '/queues/:queue/reorder',
    { preHandler: requireRole('manager') },
    async (request, reply) => {
      const { queue } = queueParams.parse(request.params);
      const body = queueMoveSchema.parse(request.body);
      await moveInQueue(app.db, actorOf(authOf(request)), queue, body);
      app.realtime.publish(queueChanged(queue, body.orderId));
      return reply.code(204).send();
    },
  );

  app.post(
    '/queues/:queue/priority',
    { preHandler: requireRole('manager') },
    async (request, reply) => {
      const { queue } = queueParams.parse(request.params);
      const body = queuePrioritySchema.parse(request.body);
      await setPriority(app.db, actorOf(authOf(request)), queue, body);
      app.realtime.publish(queueChanged(queue, body.orderId));
      return reply.code(204).send();
    },
  );
};
