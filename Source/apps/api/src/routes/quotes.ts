import {
  discountCodeAttachSchema,
  orderListQuerySchema,
  quoteSaveSchema,
  quoteUpdateSchema,
  type OrderSummaryList,
  type Quote,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { listOpenOrders } from '../services/order-list.js';
import { attachDiscountCode } from '../services/quote-codes.js';
import { quotePdf } from '../services/quote-pdf.js';
import { createQuote, loadQuote, updateQuote } from '../services/quotes.js';

const paramsSchema = z.object({ id: z.uuid() });

/**
 * Annexe B, « Devis »: the salesperson creates and edits their own, the manager edits any; the
 * cashier, the owner and the admin read. The warehouse has no access.
 */
const READERS: readonly Role[] = ['sales', 'cashier', 'manager', 'owner', 'admin'];
const EDITORS: readonly Role[] = ['sales', 'manager'];

export const quoteRoutes: FastifyPluginAsync = async (app) => {
  // The salesperson's quotes and orders still open, the manager's everyone's (RG-DEV-02/03, H56).
  app.get(
    '/quotes',
    { preHandler: requireRole(...EDITORS) },
    async (request): Promise<OrderSummaryList> => {
      const query = orderListQuerySchema.parse(request.query);
      return listOpenOrders(app.db, actorOf(authOf(request)), query);
    },
  );

  app.get(
    '/quotes/:id',
    { preHandler: requireRole(...READERS) },
    async (request): Promise<Quote> => {
      const { id } = paramsSchema.parse(request.params);
      return loadQuote(app.db, id);
    },
  );

  // Opened in a tab of the tablet, printed from the browser (RG-PDF-01).
  app.get('/quotes/:id/pdf', { preHandler: requireRole(...READERS) }, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { number, pdf } = await quotePdf(app.db, id);
    return reply
      .type('application/pdf')
      .header('content-disposition', `inline; filename="${number}.pdf"`)
      .header('cache-control', 'no-store')
      .send(pdf);
  });

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

  // The owner's code typed on the tablet (RG-REM-04, H42): used at once on this quote.
  app.post(
    '/quotes/:id/discount-code',
    { preHandler: requireRole(...EDITORS) },
    async (request): Promise<Quote> => {
      const { id } = paramsSchema.parse(request.params);
      const body = discountCodeAttachSchema.parse(request.body);
      return attachDiscountCode(app.db, actorOf(authOf(request)), id, body);
    },
  );
};
