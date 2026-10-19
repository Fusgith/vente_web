import {
  creditConditionInputSchema,
  instrumentOutcomeSchema,
  receivablePaymentInputSchema,
  type CreditCondition,
  type Receivable,
  type ReceivableList,
  type ReceivablePayment,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { Env } from '../env.js';
import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import {
  createCreditCondition,
  listCreditConditions,
  updateCreditCondition,
} from '../services/credit-conditions.js';
import {
  listReceivables,
  markInstrument,
  receiptPdf,
  settleReceivable,
} from '../services/receivables.js';

const params = z.object({ id: z.uuid() });
const listQuery = z.object({
  status: z.enum(['OPEN', 'SETTLED']).optional(),
  q: z.string().max(80).optional(),
});
/** H67: the owner sets the conditions; the register and the owner follow what is owed. */
const readers = { preHandler: requirePermission('credit.read') };
const owner = { preHandler: requirePermission('credit.conditions') };
/** Settled at the register, like a payment (annexe B, H32). */
const takers = { preHandler: requirePermission('credit.settle') };
/** H68: the manager follows the titles to cash. */
const manager = { preHandler: requirePermission('credit.instruments') };

/** Credit sale (T-095, H67): conditions, receivables and their settlements with a receipt. */
export const creditRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  app.get('/credit-conditions', readers, async (): Promise<{ items: CreditCondition[] }> => ({
    items: await listCreditConditions(app.db),
  }));

  app.post('/credit-conditions', owner, async (request, reply): Promise<CreditCondition> => {
    const input = creditConditionInputSchema.parse(request.body);
    return reply
      .code(201)
      .send(await createCreditCondition(app.db, actorOf(authOf(request)), input));
  });

  app.put('/credit-conditions/:id', owner, async (request): Promise<CreditCondition> => {
    const { id } = params.parse(request.params);
    const input = creditConditionInputSchema.parse(request.body);
    return updateCreditCondition(app.db, actorOf(authOf(request)), id, input);
  });

  app.get('/receivables', readers, async (request): Promise<ReceivableList> =>
    listReceivables(app.db, listQuery.parse(request.query)),
  );

  app.post(
    '/receivables/:id/settlements',
    takers,
    async (request, reply): Promise<ReceivablePayment> => {
      const { id } = params.parse(request.params);
      const input = receivablePaymentInputSchema.parse(request.body);
      const settlement = await settleReceivable(app.db, actorOf(authOf(request)), id, input);
      // Stored when made; a failure here is made good at the first print, like an invoice's.
      await receiptPdf(app.db, env.FILES_DIR, settlement.id).catch((error: unknown) =>
        request.log.error({ err: error, receipt: settlement.number }, 'receipt PDF not stored'),
      );
      return reply.code(201).send(settlement);
    },
  );

  app.post('/receivables/:id/instrument', manager, async (request): Promise<Receivable> => {
    const { id } = params.parse(request.params);
    const { outcome } = instrumentOutcomeSchema.parse(request.body);
    return markInstrument(app.db, actorOf(authOf(request)), id, outcome);
  });

  app.get('/receivable-settlements/:id/pdf', readers, async (request, reply) => {
    const { id } = params.parse(request.params);
    const { number, pdf } = await receiptPdf(app.db, env.FILES_DIR, id);
    return reply
      .type('application/pdf')
      .header('content-disposition', `inline; filename="${number}.pdf"`)
      .header('cache-control', 'no-store')
      .send(pdf);
  });
};
