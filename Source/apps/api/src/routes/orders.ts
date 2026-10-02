import {
  discountCodeAttachSchema,
  orderAdjustSchema,
  orderCancelSchema,
  orderSubmitSchema,
  type Order,
  type OrderStatus,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { adjustOrder, attachOrderCode, cancelOrder } from '../services/order-changes.js';
import { loadOrder, submitOrder } from '../services/orders.js';
import {
  discountDecided,
  orderAdjusted,
  orderCancelled,
  orderSubmitted,
  stockLow,
} from '../services/realtime-rooms.js';
import { stockAlerts } from '../services/stock.js';

const paramsSchema = z.object({ id: z.uuid() });

/** Annexe B: same readers as the quotes, and the warehouse, which prepares the lines (T-060). */
const READERS: readonly Role[] = ['sales', 'cashier', 'warehouse', 'manager', 'owner', 'admin'];

/** The warehouse reads only the orders paid, to hand over or handed over. */
const DELIVERY_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'PAID',
  'PREPARING',
  'READY',
  'ISSUE',
  'DELIVERED',
]);

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/orders/:id',
    { preHandler: requireRole(...READERS) },
    async (request): Promise<Order> => {
      const { id } = paramsSchema.parse(request.params);
      const order = await loadOrder(app.db, id);
      if (
        authOf(request).session.activeRole === 'warehouse' &&
        !DELIVERY_STATUSES.has(order.status)
      ) {
        throw new AppError(403, 'AUTH_FORBIDDEN');
      }
      return order;
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
      // Reserved: a product now at or under its threshold is told to the manager (RG-STK-07).
      const low = await stockAlerts(
        app.db,
        order.lines.map((line) => line.productId),
      );
      app.realtime.publish(stockLow(low.map((alert) => alert.productId)));
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

  // The owner's code typed at the register before payment (RG-CMD-05b, RG-REM-04, H42).
  app.post(
    '/orders/:id/discount-code',
    { preHandler: requireRole('cashier', 'manager') },
    async (request): Promise<Order> => {
      const { id } = paramsSchema.parse(request.params);
      const body = discountCodeAttachSchema.parse(request.body);
      const order = await attachOrderCode(app.db, actorOf(authOf(request)), id, body);
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
      const { order, withdrawn } = await cancelOrder(app.db, actorOf(authOf(request)), id, body);
      const salesUserId = order.salesUser.id;
      app.realtime.publish([
        ...orderCancelled({ id, salesUserId }),
        ...(withdrawn
          ? discountDecided(withdrawn, { id, salesUserId, status: order.status }, 'WITHDRAWN')
          : []),
      ]);
      return order;
    },
  );
};
