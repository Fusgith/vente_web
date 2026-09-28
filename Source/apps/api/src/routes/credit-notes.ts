import {
  orderRefundSchema,
  type InvoiceLookup,
  type RefundedOrder,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { Env } from '../env.js';
import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { creditNotePdf, lookupInvoice, refundOrder } from '../services/credit-notes.js';
import { orderRefunded } from '../services/realtime-rooms.js';

const idParams = z.object({ id: z.uuid() });
const lookupQuery = z.object({ number: z.string().trim().min(1).max(32) });

/** Annexe B « Annulation après paiement (avoir) »: the cashier, the manager validating (H36). */
const TAKERS: Role[] = ['cashier', 'manager'];

/** Refunds after payment and their credit notes (T-053, RG-ANN-02, RG-FAC-05, ⚠️ H36). */
export const creditNoteRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  app.get(
    '/invoices/lookup',
    { preHandler: requireRole(...TAKERS) },
    async (request): Promise<InvoiceLookup> => {
      const { number } = lookupQuery.parse(request.query);
      return lookupInvoice(app.db, number);
    },
  );

  app.post(
    '/orders/:id/refund',
    { preHandler: requireRole(...TAKERS) },
    async (request): Promise<RefundedOrder> => {
      const { id } = idParams.parse(request.params);
      const body = orderRefundSchema.parse(request.body);
      const refunded = await refundOrder(app.db, actorOf(authOf(request)), id, body);
      app.realtime.publish(orderRefunded({ id, salesUserId: refunded.order.salesUser.id }));
      // Stored at issue (RG-FAC-04); a failure here is made good at the first reprint.
      await creditNotePdf(app.db, env.FILES_DIR, refunded.creditNote.id).catch((error: unknown) =>
        request.log.error(
          { err: error, creditNote: refunded.creditNote.number },
          'credit note PDF not stored',
        ),
      );
      return refunded;
    },
  );

  app.get(
    '/credit-notes/:id/pdf',
    { preHandler: requireRole(...TAKERS, 'owner') },
    async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { number, pdf } = await creditNotePdf(app.db, env.FILES_DIR, id);
      return reply
        .type('application/pdf')
        .header('content-disposition', `inline; filename="${number}.pdf"`)
        .header('cache-control', 'no-store')
        .send(pdf);
    },
  );
};
