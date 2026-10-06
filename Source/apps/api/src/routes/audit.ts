import { auditQuerySchema, type AuditPage } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import { requireRole } from '../plugins/session.js';
import { readAuditLog } from '../services/audit-log.js';

/** The audit log, read by the manager, the owner and the admin (T-014, RG-AUD-01, annexe B). */
export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/audit',
    { preHandler: requireRole('manager', 'owner', 'admin') },
    async (request): Promise<AuditPage> =>
      readAuditLog(app.db, auditQuerySchema.parse(request.query)),
  );
};
