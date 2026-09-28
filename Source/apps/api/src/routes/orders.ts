import {
  orderAdjustSchema,
  orderCancelSchema,
  orderSubmitSchema,
  type Order,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { adjustOrder, cancelOrder } from '../services/order-changes.js';
import { loadOrder, submitOrder } from '../services/orders.js';
import { orderAdjusted, orderCancelled, orderSubmitted } from '../services/realtime-rooms.js';

const paramsSchema = z.object({ id: z.uuid() });

/** Annexe B: same readers as the quotes, and the warehouse, which prepares the lines (T-060). */
const READERS: readonly Role[] = ['sales', 'cashier', 'warehouse', 'manager', 'owner', 'admin'];

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/orders/:id',
    { preHandler: requireRole(...READERS) },
    async (request): Promise<Order> => {
      const { id } = paramsSchema.parse(request.params);
      return loadOrder(app.db, id);
    },
  );

  // Annexe B « Commande : valider »: the salesperson (taking over a colleague's quote,
  // RG-DEV-03) and the manager.
  app.post(
    '/orders/:id/submit',
    { preHandler: requireRole('sales', 'manager') },
    async (request): Promise<Order> => {
      const { id } = paramsSchema.parse(request.params);
      const body = orderSubmitSchema.parse(request.body);
      const order = await submitOrder(app.db, actorOf(authOf(request)), id, body);
      // Committed: the cashiers see the order enter their queue (RG-CMD-03).
      app.realtime.publish(orderSubmitted({ id: order.id, salesUserId: order.salesUser.id }));
      return order;
    },
  );

  // Annexe B « Commande : modifier avant paiement » at the register: lower, remove (RG-CMD-05b).
  app.post(
    '/orders/:id/adjust',
    { preHandler: requireRole('cashier', 'manager') },
    async (request): Promise<Order> => {
      const { id } = paramsSchema.parse(request.params);
      const body = orderAdjustSchema.parse(request.body);
      const order = await adjustOrder(app.db, actorOf(authOf(request)), id, body);
      app.realtime.publish(orderAdjusted(id));
      return order;
    },
  );

  // Annexe B « Annulation avant paiement »: the salesperson their own, the cashier, the manager.
  app.post(
    '/orders/:id/cancel',
    { preHandler: requireRole('sales', 'cashier', 'manager') },
    async (request): Promise<Order> => {
      const { id } = paramsSchema.parse(request.params);
      const body = orderCancelSchema.parse(request.body);
      const order = await cancelOrder(app.db, actorOf(authOf(request)), id, body);
      app.realtime.publish(orderCancelled({ id, salesUserId: order.salesUser.id }));
      return order;
    },
  );
};
