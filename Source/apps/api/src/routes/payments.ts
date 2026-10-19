import {
  paymentInputSchema,
  registerSessionOpenSchema,
  type PaidOrder,
  type PaymentMethod,
  type RegisterSession,
  type RegisterStation,
  type Role,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { Env } from '../env.js';
import { AppError } from '../errors.js';
import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { invoicePdf, readInvoiceSettings } from '../services/invoices.js';
import { payOrder, paymentMethods } from '../services/payments.js';
import { orderPaid } from '../services/realtime-rooms.js';
import { openSession, openSessionOf, registerStations } from '../services/register-sessions.js';

const idParams = z.object({ id: z.uuid() });
const idempotencyKey = z.uuid();

/** Annexe B « Paiement, facture » and « Session de caisse » (the manager who takes payments, H32). */
const TAKERS: Role[] = ['cashier', 'manager'];

export const paymentRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  app.get(
    '/payment-methods',
    { preHandler: requireRole(...TAKERS) },
    // With the step the cash part is rounded to (RG-FMT-04, H70), for the screen to show it.
    async (): Promise<{ methods: PaymentMethod[]; cashRounding: number | null }> => ({
      methods: await paymentMethods(app.db),
      cashRounding: (await readInvoiceSettings(app.db)).cashRounding,
    }),
  );

  app.get(
    '/register-sessions/current',
    { preHandler: requireRole(...TAKERS) },
    async (request): Promise<{ session: RegisterSession | null }> => ({
      session: await openSessionOf(app.db, authOf(request).user.id),
    }),
  );

  app.get(
    '/register-sessions/stations',
    { preHandler: requireRole(...TAKERS) },
    async (request): Promise<{ stations: RegisterStation[] }> => ({
      stations: await registerStations(app.db, authOf(request).user.id),
    }),
  );

  app.post(
    '/register-sessions',
    { preHandler: requireRole(...TAKERS) },
    async (request, reply): Promise<RegisterSession> => {
      const body = registerSessionOpenSchema.parse(request.body);
      const session = await openSession(app.db, actorOf(authOf(request)), body);
      return reply.code(201).send(session);
    },
  );

  // RG-PAY: the `Idempotency-Key` header makes a payment sent twice a single one (CDC technique §6).
  app.post(
    '/orders/:id/pay',
    { preHandler: requireRole(...TAKERS) },
    async (request): Promise<PaidOrder> => {
      const { id } = idParams.parse(request.params);
      const key = idempotencyKey.safeParse(request.headers['idempotency-key']);
      if (!key.success) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED');
      const body = paymentInputSchema.parse(request.body);
      const paid = await payOrder(app.db, actorOf(authOf(request)), id, body, key.data);
      app.realtime.publish(orderPaid({ id, salesUserId: paid.order.salesUser.id }));
      // Stored at issue (RG-FAC-04); a failure here is made good at the first reprint.
      await invoicePdf(app.db, env.FILES_DIR, paid.invoice.id).catch((error: unknown) =>
        request.log.error({ err: error, invoice: paid.invoice.number }, 'invoice PDF not stored'),
      );
      return paid;
    },
  );

  // The same file every time, as issued (RG-FAC-04); opened in a tab, printed from the browser.
  app.get('/invoices/:id/pdf', { preHandler: requireRole(...TAKERS) }, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const { number, pdf } = await invoicePdf(app.db, env.FILES_DIR, id);
    return reply
      .type('application/pdf')
      .header('content-disposition', `inline; filename="${number}.pdf"`)
      .header('cache-control', 'no-store')
      .send(pdf);
  });
};
