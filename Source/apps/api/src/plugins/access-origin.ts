import type { AccessOrigin } from '@vente-web/shared';
import fp from 'fastify-plugin';

import type { Env } from '../env.js';
import { ACCESS_ORIGIN_HEADER, resolveAccessOrigin } from '../services/access-origin.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** LAN or REMOTE, decided before anything else runs (CDC technique §2.2). */
    accessOrigin: AccessOrigin;
  }
}

export const accessOriginPlugin = fp<{ env: Env }>(
  async (app, { env }) => {
    app.decorateRequest('accessOrigin', 'REMOTE');
    app.addHook('onRequest', async (request) => {
      request.accessOrigin = resolveAccessOrigin({
        header: request.headers[ACCESS_ORIGIN_HEADER],
        remoteAddress: request.socket.remoteAddress,
        trustedProxies: env.TRUST_PROXY,
        defaultOrigin: env.AUTH_DEFAULT_ORIGIN,
      });
    });
  },
  { name: 'access-origin' },
);
