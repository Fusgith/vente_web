import { salesDiscountSchema, type SalesDiscount } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import { actorOf, authOf, requireAuth, requireRole } from '../plugins/session.js';
import { salesDiscountEnabled, setSalesDiscount } from '../services/sales-discount.js';

/** Whether the salesperson discounts (T-087, H60): everyone reads it, the admin sets it. */
export const salesDiscountRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sales-discount', { preHandler: requireAuth }, async (): Promise<SalesDiscount> => ({
    enabled: await salesDiscountEnabled(app.db),
  }));

  app.put(
    '/sales-discount',
    { preHandler: requireRole('admin') },
    async (request): Promise<SalesDiscount> => {
      const { enabled } = salesDiscountSchema.parse(request.body);
      await setSalesDiscount(app.db, actorOf(authOf(request)), enabled);
      return { enabled: await salesDiscountEnabled(app.db) };
    },
  );
};
