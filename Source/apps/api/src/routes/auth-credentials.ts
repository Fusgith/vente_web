import {
  changePasswordBodySchema,
  changePinBodySchema,
  totpConfirmBodySchema,
  totpEnrolBodySchema,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import { actorOf, authOf, requireAuth } from '../plugins/session.js';
import {
  changeOwnPassword,
  changeOwnPin,
  confirmTotpEnrolment,
  startTotpEnrolment,
} from '../services/credentials.js';
import { authRateLimit } from './rate-limit.js';

/** Self-service credentials: own PIN / password, TOTP enrolment (⚠️ H20). */
export const authCredentialRoutes: FastifyPluginAsync = async (app) => {
  // Every route here takes a secret or a code: same rate limit as the login (RG-USR-05).
  const guarded = { preHandler: requireAuth, ...authRateLimit };

  app.put('/auth/pin', guarded, async (request, reply) => {
    const { current, pin } = changePinBodySchema.parse(request.body);
    await changeOwnPin(app.db, actorOf(authOf(request)), current, pin);
    return reply.code(204).send();
  });

  app.put('/auth/password', guarded, async (request, reply) => {
    const { current, password } = changePasswordBodySchema.parse(request.body);
    await changeOwnPassword(app.db, actorOf(authOf(request)), current, password);
    return reply.code(204).send();
  });

  app.post('/auth/totp', guarded, async (request) => {
    const { code } = totpEnrolBodySchema.parse(request.body ?? {});
    return startTotpEnrolment(app.db, actorOf(authOf(request)), request.accessOrigin, code);
  });

  app.post('/auth/totp/confirm', guarded, async (request, reply) => {
    const { code } = totpConfirmBodySchema.parse(request.body);
    await confirmTotpEnrolment(app.db, actorOf(authOf(request)), code);
    return reply.code(204).send();
  });
};
