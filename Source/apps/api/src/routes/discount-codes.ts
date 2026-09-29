import {
  discountCodeIssueSchema,
  type DiscountCode,
  type DiscountCodeList,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import {
  issueDiscountCode,
  listDiscountCodes,
  revokeDiscountCode,
} from '../services/discount-codes.js';

const params = z.object({ id: z.uuid() });
/** Annexe B « émettre un code, révoquer »: the owner alone. */
const owner = { preHandler: requireRole('owner') };

/** Discount codes issued by the owner (T-034, RG-REM-04/07, H41). */
export const discountCodeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discount-codes', owner, async (): Promise<DiscountCodeList> => ({
    items: await listDiscountCodes(app.db),
  }));

  app.post('/discount-codes', owner, async (request, reply): Promise<DiscountCode> => {
    const input = discountCodeIssueSchema.parse(request.body);
    const code = await issueDiscountCode(app.db, actorOf(authOf(request)), input);
    return reply.code(201).send(code);
  });

  app.post('/discount-codes/:id/revoke', owner, async (request): Promise<DiscountCode> =>
    revokeDiscountCode(app.db, actorOf(authOf(request)), params.parse(request.params).id),
  );
};
