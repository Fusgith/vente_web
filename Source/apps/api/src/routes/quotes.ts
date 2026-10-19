import {
  orderListQuerySchema,
  quoteSaveSchema,
  quoteUpdateSchema,
  type OrderSummaryList,
  type Quote,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import { listOpenOrders } from '../services/order-list.js';
import { quotePdf } from '../services/quote-pdf.js';
import { createQuote, loadQuote, updateQuote } from '../services/quotes.js';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Annexe B, « Devis »: the salesperson creates and edits their own, the manager edits any; the
 * cashier, the owner and the admin read. The warehouse has no access.
 */

export const quoteRoutes: FastifyPluginAsync = async (app) => {
  // The salesperson's quotes and orders still open, the manager's everyone's (RG-DEV-02/03, H56).
  app.get(
    '/quotes',
    { preHandler: requirePermission('quotes.edit') },
    async (request): Promise<OrderSummaryList> => {
      const query = orderListQuerySchema.parse(request.query);
      return listOpenOrders(app.db, actorOf(authOf(request)), query);
    },
  );

  app.get(
    '/quotes/:id',
    { preHandler: requirePermission('quotes.read') },
    async (request): Promise<Quote> => {
      const { id } = paramsSchema.parse(request.params);
      return loadQuote(app.db, id);
    },
  );

  // Opened in a tab of the tablet, printed from the browser (RG-PDF-01).
  app.get(
    '/quotes/:id/pdf',
    { preHandler: requirePermission('quotes.read') },
    async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const { number, pdf } = await quotePdf(app.db, id);
      // Opened, the quote is handed to the customer: changed, it takes a new number (H69).
      await app.db.order.updateMany({
        where: { id, status: 'DRAFT', handedAt: null },
        data: { handedAt: new Date() },
      });
      return reply
        .type('application/pdf')
        .header('content-disposition', `inline; filename="${number}.pdf"`)
        .header('cache-control', 'no-store')
        .send(pdf);
    },
  );

  app.post(
    '/quotes',
    { preHandler: requirePermission('quotes.create') },
    async (request, reply) => {
      const body = quoteSaveSchema.parse(request.body);
      const quote = await createQuote(app.db, actorOf(authOf(request)), body);
      return reply.code(201).send(quote);
    },
  );

  app.put(
    '/quotes/:id',
    { preHandler: requirePermission('quotes.edit') },
    async (request): Promise<Quote> => {
      const { id } = paramsSchema.parse(request.params);
      const body = quoteUpdateSchema.parse(request.body);
      return updateQuote(app.db, actorOf(authOf(request)), id, body);
    },
  );
};
