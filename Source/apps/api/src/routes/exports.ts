import { EXPORT_KINDS, exportQuerySchema } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import { buildExport } from '../services/exports.js';

const params = z.object({ kind: z.enum(EXPORT_KINDS) });

/** Excel exports (T-071, RG-EXP-01 à 03); which kind a role may take is checked by the service. */
export const exportRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/exports/:kind',
    { preHandler: requirePermission('exports') },
    async (request, reply) => {
      const { kind } = params.parse(request.params);
      const query = exportQuerySchema.parse(request.query);
      const { file, content } = await buildExport(app.db, actorOf(authOf(request)), kind, query);
      return reply
        .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('content-disposition', `attachment; filename="${file}"`)
        .header('cache-control', 'no-store')
        .send(content);
    },
  );
};
