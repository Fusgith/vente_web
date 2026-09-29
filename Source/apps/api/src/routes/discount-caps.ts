import {
  defaultDiscountCapInputSchema,
  discountCapInputSchema,
  type DiscountCaps,
  type ProductDiscountCaps,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import {
  listDiscountCaps,
  productDiscountCaps,
  setDefaultDiscountCap,
  setDiscountCap,
} from '../services/discount-caps.js';

const params = z.object({ id: z.uuid() });

/** Annexe B « Plafonds de remise »: read by every role but the warehouse, set by the owner. */
const READERS = ['admin', 'manager', 'sales', 'cashier', 'owner'] as const;
const setter = { preHandler: requireRole('owner') };

/** Discount caps (T-024, RG-REM-01, decision H15). */
export const discountCapRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/discount-caps',
    { preHandler: requireRole(...READERS) },
    async (): Promise<DiscountCaps> => listDiscountCaps(app.db),
  );

  app.get(
    '/products/:id/discount-caps',
    { preHandler: requireRole(...READERS) },
    async (request): Promise<ProductDiscountCaps> =>
      productDiscountCaps(app.db, params.parse(request.params).id),
  );

  app.put('/discount-caps/default', setter, async (request): Promise<DiscountCaps> => {
    const { pct } = defaultDiscountCapInputSchema.parse(request.body);
    await setDefaultDiscountCap(app.db, actorOf(authOf(request)), pct);
    return listDiscountCaps(app.db);
  });

  app.put('/categories/:id/discount-cap', setter, async (request): Promise<DiscountCaps> => {
    const { id } = params.parse(request.params);
    const { pct } = discountCapInputSchema.parse(request.body);
    await setDiscountCap(app.db, actorOf(authOf(request)), 'category', id, pct);
    return listDiscountCaps(app.db);
  });

  app.put('/products/:id/discount-cap', setter, async (request): Promise<ProductDiscountCaps> => {
    const { id } = params.parse(request.params);
    const { pct } = discountCapInputSchema.parse(request.body);
    await setDiscountCap(app.db, actorOf(authOf(request)), 'product', id, pct);
    return productDiscountCaps(app.db, id);
  });

  app.put(
    '/product-units/:id/discount-cap',
    setter,
    async (request): Promise<ProductDiscountCaps> => {
      const { id } = params.parse(request.params);
      const { pct } = discountCapInputSchema.parse(request.body);
      await setDiscountCap(app.db, actorOf(authOf(request)), 'product_unit', id, pct);
      const unit = await app.db.productUnit.findUniqueOrThrow({
        where: { id },
        select: { productId: true },
      });
      return productDiscountCaps(app.db, unit.productId);
    },
  );
};
