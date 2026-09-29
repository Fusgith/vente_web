import { stockAdjustmentSchema, type ProductStock, type StockAlerts } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { stockLow } from '../services/realtime-rooms.js';
import { adjustStock, loadProductStock, stockAlerts } from '../services/stock.js';

const productParams = z.object({ id: z.uuid() });

/** Annexe B « Ajustement de stock »: the manager; the admin, assisted, for a correction (RG-AUD-03). */
const ADJUSTERS = ['manager', 'admin'] as const;

/** Stock adjustments and alerts (T-023, RG-STK-05 à 07). */
export const stockRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/products/:id/stock',
    { preHandler: requireRole(...ADJUSTERS) },
    async (request): Promise<ProductStock> => {
      const { id } = productParams.parse(request.params);
      return loadProductStock(app.db, id);
    },
  );

  app.post(
    '/products/:id/stock/adjustments',
    { preHandler: requireRole(...ADJUSTERS) },
    async (request): Promise<ProductStock> => {
      const { id } = productParams.parse(request.params);
      const body = stockAdjustmentSchema.parse(request.body);
      const { stock, low } = await adjustStock(app.db, actorOf(authOf(request)), id, body);
      if (low) app.realtime.publish(stockLow([id]));
      return stock;
    },
  );

  // RG-STK-07: the manager and the owner follow the products under their threshold.
  app.get(
    '/stock/alerts',
    { preHandler: requireRole('manager', 'owner') },
    async (): Promise<StockAlerts> => ({ items: await stockAlerts(app.db) }),
  );
};
