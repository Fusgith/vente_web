import { quoteSaveSchema, quoteUpdateSchema, type Quote, type Role } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { createQuote, loadQuote, updateQuote } from '../services/quotes.js';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Annexe B, « Devis »: the salesperson creates and edits their own, the manager edits any; the
 * cashier, the owner and the admin read. The warehouse has no access.
 */
const READERS: readonly Role[] = ['sales', 'cashier', 'manager', 'owner', 'admin'];
const EDITORS: readonly Role[] = ['sales', 'manager'];

export const quoteRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/quotes/:id',
    { preHandler: requireRole(...READERS) },
    async (request): Promise<Quote> => {
      const { id } = paramsSchema.parse(request.params);
      return loadQuote(app.db, id);
    },
  );

  app.post('/quotes', { preHandler: requireRole('sales') }, async (request, reply) => {
    const body = quoteSaveSchema.parse(request.body);
    const quote = await createQuote(app.db, actorOf(authOf(request)), body);
    return reply.code(201).send(quote);
  });

  app.put(
    '/quotes/:id',
    { preHandler: requireRole(...EDITORS) },
    async (request): Promise<Quote> => {
      const { id } = paramsSchema.parse(request.params);
      const body = quoteUpdateSchema.parse(request.body);
      return updateQuote(app.db, actorOf(authOf(request)), id, body);
    },
  );
};
