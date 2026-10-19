import { dashboardQuerySchema, type Dashboard } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requirePermission } from '../plugins/session.js';
import { loadDashboard } from '../services/dashboard.js';

/** The owner's dashboard (T-070, RG-DSH-01 à 04); the manager sees the same (RG-DSH-06). */
export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/dashboard',
    { preHandler: requirePermission('dashboard') },
    async (request): Promise<Dashboard> =>
      loadDashboard(app.db, dashboardQuerySchema.parse(request.query)),
  );
};
