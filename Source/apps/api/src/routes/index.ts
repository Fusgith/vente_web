import type { FastifyPluginAsync } from 'fastify';

import type { Env } from '../env.js';
import { authCredentialRoutes } from './auth-credentials.js';
import { authRoutes } from './auth.js';
import { userRoutes } from './users.js';

/** Everything under `/api/v1` (CDC technique section 6); `/healthz` stays at the root. */
export const apiRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  await app.register(authRoutes, { env });
  await app.register(authCredentialRoutes);
  await app.register(userRoutes);
};
