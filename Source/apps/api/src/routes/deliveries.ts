import {
  deliveryIssueReportSchema,
  issueDecisionSchema,
  orderDeliverSchema,
  type IssueEntry,
  type Order,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import {
  backToDeliveryQueue,
  deliverOrder,
  markReady,
  takeForDelivery,
} from '../services/deliveries.js';
import {
  deliverPartly,
  listIssues,
  reportIssue,
  requeueIssue,
} from '../services/delivery-issues.js';
import {
  orderBackToDelivery,
  orderDelivered,
  orderIssue,
  orderReady,
  orderRequeued,
  orderTaken,
} from '../services/realtime-rooms.js';

const orderParams = z.object({ id: z.uuid() });

/** Annexe B « Livraison » (the manager standing in, RG-USR-08). */
const COUNTER: Role[] = ['warehouse', 'manager'];

/** The counters (T-060, RG-LIV-01 à 03, H34): take, prepare, call, hand over. */
export const deliveryRoutes: FastifyPluginAsync = async (app) => {
  const owner = (order: Order) => ({ id: order.id, salesUserId: order.salesUser.id });

  app.post(
    '/queues/delivery/take-next',
    { preHandler: requireRole(...COUNTER) },
    async (request): Promise<Order> => {
      const order = await takeForDelivery(app.db, actorOf(authOf(request)), null);
      app.realtime.publish(orderTaken(owner(order)));
      return order;
    },
  );

  // A ticket taken out of turn: the customer stands at the counter.
  app.post(
    '/orders/:id/delivery/take',
    { preHandler: requireRole(...COUNTER) },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const order = await takeForDelivery(app.db, actorOf(authOf(request)), id);
      app.realtime.publish(orderTaken(owner(order)));
      return order;
    },
  );

  app.post(
    '/orders/:id/delivery/ready',
    { preHandler: requireRole(...COUNTER) },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const order = await markReady(app.db, actorOf(authOf(request)), id);
      app.realtime.publish(orderReady(owner(order)));
      return order;
    },
  );

  app.post(
    '/orders/:id/delivery/no-show',
    { preHandler: requireRole(...COUNTER) },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const { order, noShowCount } = await backToDeliveryQueue(
        app.db,
        actorOf(authOf(request)),
        id,
        'no_show',
      );
      app.realtime.publish(orderBackToDelivery(owner(order), 'no_show', noShowCount));
      return order;
    },
  );

  // Reassignment (RG-USR-08): the manager gives the order back to the queue, at its place.
  app.post(
    '/orders/:id/delivery/release',
    { preHandler: requireRole('manager') },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const { order, noShowCount } = await backToDeliveryQueue(
        app.db,
        actorOf(authOf(request)),
        id,
        'released',
      );
      app.realtime.publish(orderBackToDelivery(owner(order), 'released', noShowCount));
      return order;
    },
  );

  app.post(
    '/orders/:id/delivery/deliver',
    { preHandler: requireRole(...COUNTER) },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const body = orderDeliverSchema.parse(request.body);
      const order = await deliverOrder(app.db, actorOf(authOf(request)), id, body);
      app.realtime.publish(orderDelivered(owner(order)));
      return order;
    },
  );

  // A line missing or damaged (RG-LIV-04, H37): the manager decides.
  app.post(
    '/orders/:id/delivery/issue',
    { preHandler: requireRole(...COUNTER) },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const body = deliveryIssueReportSchema.parse(request.body);
      const order = await reportIssue(app.db, actorOf(authOf(request)), id, body);
      app.realtime.publish(orderIssue(owner(order)));
      return order;
    },
  );

  app.get(
    '/deliveries/issues',
    { preHandler: requireRole('manager') },
    async (): Promise<IssueEntry[]> => listIssues(app.db),
  );

  app.post(
    '/orders/:id/issue/requeue',
    { preHandler: requireRole('manager') },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const body = issueDecisionSchema.parse(request.body);
      const order = await requeueIssue(app.db, actorOf(authOf(request)), id, body);
      app.realtime.publish(orderRequeued(owner(order)));
      return order;
    },
  );

  app.post(
    '/orders/:id/issue/deliver-partly',
    { preHandler: requireRole('manager') },
    async (request): Promise<Order> => {
      const { id } = orderParams.parse(request.params);
      const body = issueDecisionSchema.parse(request.body);
      const order = await deliverPartly(app.db, actorOf(authOf(request)), id, body);
      app.realtime.publish(orderDelivered(owner(order)));
      return order;
    },
  );
};
