import {
  discountCodeIssueSchema,
  type DiscountCode,
  type DiscountCodeList,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import {
  defaultValidUntil,
  issueDiscountCode,
  listDiscountCodes,
  revokeDiscountCode,
} from '../services/discount-codes.js';

const params = z.object({ id: z.uuid() });
/** Annexe B « émettre un code, révoquer »: the owner alone. */
const owner = { preHandler: requirePermission('discountCodes') };

/** Promo codes issued by the owner (T-034, T-091, RG-REM-04/07, H41, H63). */
export const discountCodeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discount-codes', owner, async (): Promise<DiscountCodeList> => {
    const now = new Date();
    const [items, validUntil] = await Promise.all([
      listDiscountCodes(app.db, now),
      defaultValidUntil(app.db, now),
    ]);
    return { items, defaultValidUntil: validUntil };
  });

  app.post('/discount-codes', owner, async (request, reply): Promise<DiscountCode> => {
    const input = discountCodeIssueSchema.parse(request.body);
    const code = await issueDiscountCode(app.db, actorOf(authOf(request)), input);
    return reply.code(201).send(code);
  });

  app.post('/discount-codes/:id/revoke', owner, async (request): Promise<DiscountCode> =>
    revokeDiscountCode(app.db, actorOf(authOf(request)), params.parse(request.params).id),
  );
};
