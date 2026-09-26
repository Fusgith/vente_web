import {
  changePasswordBodySchema,
  changePinBodySchema,
  totpConfirmBodySchema,
  totpEnrolBodySchema,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import type { Env } from '../env.js';
import { AppError } from '../errors.js';
import { actorOf, authOf, requireAuth } from '../plugins/session.js';
import { changeOwnPassword, changeOwnPin } from '../services/credentials.js';
import { confirmTotpEnrolment, startTotpEnrolment } from '../services/totp-enrolment.js';
import { authRateLimit } from './rate-limit.js';

/** Self-service credentials: own PIN / password, TOTP enrolment (H20). */
export const authCredentialRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  // Every route here takes a secret or a code: same rate limit as the login (RG-USR-05).
  const guarded = { preHandler: requireAuth, ...authRateLimit };

  // An attempt refused by a lock adds no failure, so no audit row: the application log keeps
  // it, as for the login (H19).
  app.addHook('onError', async (request, _reply, error) => {
    if (!(error instanceof AppError) || error.code !== 'AUTH_LOCKED') return;
    request.log.warn(
      { userId: request.auth?.user.id, origin: request.accessOrigin, details: error.details },
      'attempt refused: account locked',
    );
  });

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
    return startTotpEnrolment(
      app.db,
      actorOf(authOf(request)),
      request.accessOrigin,
      code,
      env.APP_NAME,
    );
  });

  app.post('/auth/totp/confirm', guarded, async (request, reply) => {
    const { code } = totpConfirmBodySchema.parse(request.body);
    await confirmTotpEnrolment(app.db, actorOf(authOf(request)), request.accessOrigin, code);
    return reply.code(204).send();
  });
};
