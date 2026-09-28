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

import { AppError } from '../errors.js';
import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { payOrder, paymentMethods } from '../services/payments.js';
import { orderPaid } from '../services/realtime-rooms.js';
import { openSession, openSessionOf, registerStations } from '../services/register-sessions.js';

const orderParams = z.object({ id: z.uuid() });
const idempotencyKey = z.uuid();

/** Annexe B « Paiement, facture » and « Session de caisse » (the manager who takes payments, H32). */
const TAKERS: Role[] = ['cashier', 'manager'];

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/payment-methods',
    { preHandler: requireRole(...TAKERS) },
    async (): Promise<{ methods: PaymentMethod[] }> => ({ methods: await paymentMethods(app.db) }),
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
      const { id } = orderParams.parse(request.params);
      const key = idempotencyKey.safeParse(request.headers['idempotency-key']);
      if (!key.success) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED');
      const body = paymentInputSchema.parse(request.body);
      const paid = await payOrder(app.db, actorOf(authOf(request)), id, body, key.data);
      app.realtime.publish(orderPaid({ id, salesUserId: paid.order.salesUser.id }));
      return paid;
    },
  );
};
