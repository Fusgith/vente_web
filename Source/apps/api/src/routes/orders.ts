import { orderSubmitSchema, type Order, type Role } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { loadOrder, submitOrder } from '../services/orders.js';

const paramsSchema = z.object({ id: z.uuid() });

/** Annexe B: same readers as the quotes; the warehouse gets its own view with deliveries (T-060). */
const READERS: readonly Role[] = ['sales', 'cashier', 'manager', 'owner', 'admin'];

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
      return submitOrder(app.db, actorOf(authOf(request)), id, body);
    },
  );
};
