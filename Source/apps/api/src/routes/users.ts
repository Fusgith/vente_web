import {
  createUserBodySchema,
  setPasswordBodySchema,
  setPinBodySchema,
  updateUserBodySchema,
  type ActivationCode,
  type UserAccount,
  type UserAccountList,
} from '@vente-web/shared';
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
import { issueActivationCode } from '../services/owner-activation.js';
import { createUser, listUsers, updateUser } from '../services/users.js';

const paramsSchema = z.object({ id: z.uuid() });

/** Accounts and their credentials, managed by the admin (annexe B; RG-USR-01/02/06; H20; T-016). */
export const userRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: requireRole('admin') };

  app.get('/users', adminOnly, async (): Promise<UserAccountList> => {
    return { users: await listUsers(app.db) };
  });

  app.post('/users', adminOnly, async (request, reply): Promise<UserAccount> => {
    const body = createUserBodySchema.parse(request.body);
    const account = await createUser(app.db, actorOf(authOf(request)), body);
    return reply.code(201).send(account);
  });

  app.patch('/users/:id', adminOnly, async (request): Promise<UserAccount> => {
    const { id } = paramsSchema.parse(request.params);
    const body = updateUserBodySchema.parse(request.body);
    return updateUser(app.db, actorOf(authOf(request)), id, body);
  });

  // The owner's password stays theirs: the admin hands over a one-time code instead (RG-USR-10).
  app.post(
    '/users/:id/activation-code',
    adminOnly,
    async (request, reply): Promise<ActivationCode> => {
      const { id } = paramsSchema.parse(request.params);
      const code = await issueActivationCode(app.db, actorOf(authOf(request)), id);
      return reply.code(201).send(code);
    },
  );

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
