import { setPasswordBodySchema, setPinBodySchema } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import {
  adminResetTotp,
  adminRevokeSessions,
  adminSetPassword,
  adminSetPin,
  adminUnlock,
} from '../services/credentials.js';

const paramsSchema = z.object({ id: z.uuid() });

/** Account credentials managed by the admin (annexe B; ⚠️ H20). Account CRUD itself is T-016. */
export const userRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: requireRole('admin') };

  app.put('/users/:id/pin', adminOnly, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { pin } = setPinBodySchema.parse(request.body);
    await adminSetPin(app.db, actorOf(authOf(request)), id, pin);
    return reply.code(204).send();
  });

  app.put('/users/:id/password', adminOnly, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { password } = setPasswordBodySchema.parse(request.body);
    await adminSetPassword(app.db, actorOf(authOf(request)), id, password);
    return reply.code(204).send();
  });

  app.post('/users/:id/unlock', adminOnly, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await adminUnlock(app.db, actorOf(authOf(request)), id);
    return reply.code(204).send();
  });

  app.delete('/users/:id/totp', adminOnly, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await adminResetTotp(app.db, actorOf(authOf(request)), id);
    return reply.code(204).send();
  });

  app.delete('/users/:id/sessions', adminOnly, async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await adminRevokeSessions(app.db, actorOf(authOf(request)), id);
    return reply.code(204).send();
  });
};
