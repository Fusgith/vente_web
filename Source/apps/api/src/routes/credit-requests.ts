import {
  creditRequestCreateSchema,
  creditRequestGrantSchema,
  type CreditRequest,
  type CreditRequestList,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import {
  createCreditRequest,
  decideCreditRequest,
  listCreditRequests,
} from '../services/credit-requests.js';
import { creditDecided, creditRequested } from '../services/realtime-rooms.js';

const params = z.object({ id: z.uuid() });
/** The owner alone grants credit beyond the conditions (H67, ⚠️ H76). */
const owner = { preHandler: requirePermission('creditRequests.decide') };

/** Credit asked of the owner when the conditions refuse it (T-095b, ⚠️ H76). */
export const creditRequestRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/credit-requests',
    { preHandler: requirePermission('creditRequests.board') },
    async (): Promise<CreditRequestList> => listCreditRequests(app.db),
  );

  app.post(
    '/credit-requests',
    { preHandler: requirePermission('creditRequests.ask') },
    async (request, reply): Promise<CreditRequest> => {
      const input = creditRequestCreateSchema.parse(request.body);
      const created = await createCreditRequest(app.db, actorOf(authOf(request)), input);
      app.realtime.publish(creditRequested(created.id, created.order.id));
      app.push.notifyCreditRequest(created);
      return reply.code(201).send(created);
    },
  );

  app.post('/credit-requests/:id/grant', owner, async (request): Promise<CreditRequest> => {
    const { id } = params.parse(request.params);
    const { days } = creditRequestGrantSchema.parse(request.body);
    const granted = await decideCreditRequest(app.db, actorOf(authOf(request)), id, days);
    app.realtime.publish(creditDecided(id, granted.order.id, granted.requestedBy.id, 'GRANTED'));
    return granted;
  });

  app.post('/credit-requests/:id/reject', owner, async (request): Promise<CreditRequest> => {
    const { id } = params.parse(request.params);
    const rejected = await decideCreditRequest(app.db, actorOf(authOf(request)), id, null);
    app.realtime.publish(creditDecided(id, rejected.order.id, rejected.requestedBy.id, 'REJECTED'));
    return rejected;
  });
};
