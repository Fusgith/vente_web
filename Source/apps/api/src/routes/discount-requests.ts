import {
  discountRequestCreateSchema,
  discountRequestGrantSchema,
  type DiscountReasons,
  type DiscountRequest,
  type DiscountRequestList,
  type Order,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { grantDiscountRequest } from '../services/discount-grants.js';
import {
  createDiscountRequest,
  discountReasons,
  listDiscountRequests,
  rejectDiscountRequest,
  setAside,
  withdrawDiscountRequest,
} from '../services/discount-requests.js';
import { discountDecided, discountRequested, orderSetAside } from '../services/realtime-rooms.js';

const params = z.object({ id: z.uuid() });
/** Annexe B « demander une remise exceptionnelle » (⚠️ H51): who sells and who cashes. */
const askers = { preHandler: requireRole('sales', 'cashier', 'manager') };
/** Annexe B « accorder une remise exceptionnelle »: the owner alone (RG-REM-03). */
const owner = { preHandler: requireRole('owner') };

/** The order as its followers know it: id, salesperson, state. */
const followed = (order: Order) => ({
  id: order.id,
  salesUserId: order.salesUser.id,
  status: order.status,
});

/** Exceptional discount requests (T-033, RG-REM-03/05, ⚠️ H51 to H54). */
export const discountRequestRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/discount-requests/reasons',
    { preHandler: requireRole('sales', 'cashier', 'manager', 'owner') },
    async (): Promise<DiscountReasons> => ({ reasons: await discountReasons(app.db) }),
  );

  // The owner decides; the manager follows them (RG-DSH-06).
  app.get(
    '/discount-requests',
    { preHandler: requireRole('owner', 'manager') },
    async (): Promise<DiscountRequestList> => listDiscountRequests(app.db),
  );

  app.post('/discount-requests', askers, async (request, reply): Promise<Order> => {
    const input = discountRequestCreateSchema.parse(request.body);
    const { order, requestId } = await createDiscountRequest(
      app.db,
      actorOf(authOf(request)),
      input,
    );
    app.realtime.publish(discountRequested(requestId, followed(order)));
    return reply.code(201).send(order);
  });

  app.post('/discount-requests/:id/grant', owner, async (request): Promise<DiscountRequest> => {
    const { id } = params.parse(request.params);
    const input = discountRequestGrantSchema.parse(request.body);
    const granted = await grantDiscountRequest(app.db, actorOf(authOf(request)), id, input);
    app.realtime.publish(discountDecided(id, followed(granted.order), 'GRANTED'));
    return granted;
  });

  app.post('/discount-requests/:id/reject', owner, async (request): Promise<DiscountRequest> => {
    const { id } = params.parse(request.params);
    const rejected = await rejectDiscountRequest(app.db, actorOf(authOf(request)), id);
    app.realtime.publish(discountDecided(id, followed(rejected.order), 'REJECTED'));
    return rejected;
  });

  app.post('/discount-requests/:id/withdraw', askers, async (request): Promise<Order> => {
    const { id } = params.parse(request.params);
    const order = await withdrawDiscountRequest(app.db, actorOf(authOf(request)), id);
    app.realtime.publish(discountDecided(id, followed(order), 'WITHDRAWN'));
    return order;
  });

  // Annexe B « File caisse : appeler / absent »: set aside while the owner decides (⚠️ H52).
  app.post(
    '/orders/:id/set-aside',
    { preHandler: requireRole('cashier', 'manager') },
    async (request): Promise<Order> => {
      const { id } = params.parse(request.params);
      const order = await setAside(app.db, actorOf(authOf(request)), id);
      app.realtime.publish(orderSetAside({ id, salesUserId: order.salesUser.id }));
      return order;
    },
  );
};
