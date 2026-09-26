import type { FastifyPluginAsync } from 'fastify';

import type { Env } from '../env.js';
import { authCredentialRoutes } from './auth-credentials.js';
import { authRoutes } from './auth.js';
import { catalogRoutes } from './catalog.js';
import { customerRoutes } from './customers.js';
import { orderRoutes } from './orders.js';
import { quoteRoutes } from './quotes.js';
import { userRoutes } from './users.js';

/** Everything under `/api/v1` (CDC technique section 6); `/healthz` stays at the root. */
export const apiRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  await app.register(authRoutes, { env });
  await app.register(authCredentialRoutes, { env });
  await app.register(userRoutes);
  await app.register(catalogRoutes);
  await app.register(customerRoutes);
  await app.register(quoteRoutes);
  await app.register(orderRoutes);
};
