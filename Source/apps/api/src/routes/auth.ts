import { activateBodySchema, loginBodySchema, switchRoleBodySchema } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import type { Env } from '../env.js';
import { authOf, requireAuth, sessionCookieOptions } from '../plugins/session.js';
import { login } from '../services/login.js';
import { activateOwner } from '../services/owner-activation.js';
import { endAllSessions, endSession, sessionCookieName, toAuthMe } from '../services/sessions.js';
import { switchRole } from '../services/switch-role.js';
import { authRateLimit } from './rate-limit.js';

/** Login, session and role endpoints (RG-USR-03/04/05, CDC technique §8). */
export const authRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const cookieName = sessionCookieName(env.COOKIE_SECURE);
  const cookieOptions = sessionCookieOptions(env);

  app.post('/auth/login', authRateLimit, async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const result = await login(
      { db: app.db, sessionHours: env.AUTH_SESSION_HOURS, log: request.log },
      body,
      request.accessOrigin,
    );
    reply.setCookie(cookieName, result.token, cookieOptions);
    return result.me;
  });

  /** The owner chooses their password with the admin's one-time code (RG-USR-10), then logs in. */
  app.post('/auth/activate', authRateLimit, async (request, reply) => {
    const body = activateBodySchema.parse(request.body);
    await activateOwner(app.db, body, request.accessOrigin);
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => toAuthMe(authOf(request)));

  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await endSession(app.db, authOf(request));
    reply.clearCookie(cookieName, cookieOptions);
    return reply.code(204).send();
  });

  app.post('/auth/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    const count = await endAllSessions(app.db, authOf(request));
    reply.clearCookie(cookieName, cookieOptions);
    return { count };
  });

  app.post('/auth/switch-role', { preHandler: requireAuth }, async (request) => {
    const { role } = switchRoleBodySchema.parse(request.body);
    return switchRole(app.db, authOf(request), role);
  });
};
