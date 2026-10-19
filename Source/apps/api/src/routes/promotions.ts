import { promotionCreateSchema, type Promotion, type PromotionList } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import { createPromotion, listPromotions, withdrawPromotion } from '../services/promotions.js';

const params = z.object({ id: z.uuid() });
/** H49 b: the owner alone marks the products to propose. */
const owner = { preHandler: requirePermission('promotions') };

/** Products « à proposer » (T-037, RG-DEV-06 §6, H46); the tablets read them with the favorites. */
export const promotionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/promotions', owner, async (): Promise<PromotionList> => ({
    items: await listPromotions(app.db),
  }));

  app.post('/promotions', owner, async (request, reply): Promise<Promotion> => {
    const input = promotionCreateSchema.parse(request.body);
    return reply.code(201).send(await createPromotion(app.db, actorOf(authOf(request)), input));
  });

  app.post('/promotions/:id/withdraw', owner, async (request): Promise<Promotion> =>
    withdrawPromotion(app.db, actorOf(authOf(request)), params.parse(request.params).id),
  );
};
