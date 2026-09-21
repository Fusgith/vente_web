import type { FastifyPluginAsync } from 'fastify';

import { API_VERSION } from '../version.js';

/** Liveness probe used by Docker and Caddy; no auth, no database access. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/healthz', async () => ({
    status: 'ok',
    version: API_VERSION,
    uptimeSeconds: Math.floor(process.uptime()),
  }));
};
