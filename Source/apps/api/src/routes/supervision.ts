import type { SupervisionToday } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireRole } from '../plugins/session.js';
import { loadToday } from '../services/supervision.js';

/** The manager's supervision (RG-DSP-04); the owner follows it too (RG-DSH-06). */
export const supervisionRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/supervision/today',
    { preHandler: requireRole('manager', 'owner') },
    async (): Promise<SupervisionToday> => loadToday(app.db),
  );
};
