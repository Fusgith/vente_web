import type { ErrorCode } from '@vente-web/shared';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';

import type { Env } from '../env.js';
import { AppError } from '../errors.js';
import { can, type Permission } from '../permissions.js';
import type { Actor } from '../services/actor.js';
import { resolveSession, sessionCookieName, type AuthContext } from '../services/sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved session, or null; `authFailure` then says why (expired, idle, wrong origin…). */
    auth: AuthContext | null;
    authFailure: ErrorCode | null;
  }
}

/** httpOnly + SameSite=Lax + path=/ (T5); `Secure` and the `__Host-` prefix go together. */
export function sessionCookieOptions(env: Env): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: env.AUTH_SESSION_HOURS * 3600,
  };
}

/**
 * Resolves the session cookie on every request. Routes opt in with `requireAuth` /
 * `requirePermission` (annexe B, T-013).
 */
export const sessionPlugin = fp<{ env: Env }>(
  async (app, { env }) => {
    const cookieName = sessionCookieName(env.COOKIE_SECURE);
    app.decorateRequest('auth', null);
    app.decorateRequest('authFailure', null);
    app.addHook('onRequest', async (request, reply) => {
      const token = request.cookies[cookieName];
      if (!token) return;
      const result = await resolveSession(app.db, token, request.accessOrigin);
      if (result.auth) {
        request.auth = result.auth;
      } else {
        request.authFailure = result.failure;
        reply.clearCookie(cookieName, sessionCookieOptions(env));
      }
    });
  },
  { name: 'session', dependencies: ['@fastify/cookie', 'db', 'access-origin'] },
);

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError(401, request.authFailure ?? 'AUTH_REQUIRED');
  return request.auth;
}

export function actorOf(auth: AuthContext): Actor {
  return {
    userId: auth.user.id,
    sessionId: auth.session.id,
    activeRole: auth.session.activeRole,
    stationId: auth.session.stationId,
    origin: auth.session.origin,
    authMethod: auth.session.authMethod,
  };
}

export const requireAuth: preHandlerAsyncHookHandler = async (request) => {
  authOf(request);
};

/** The active role of the session must hold `permission` (annexe B, T-013). */
export function requirePermission(permission: Permission): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = authOf(request);
    if (!can(auth.session.activeRole, permission)) throw new AppError(403, 'AUTH_FORBIDDEN');
  };
}
