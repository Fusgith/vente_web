import {
  IMPORT_MAX_BYTES,
  importCommitSchema,
  importUploadSchema,
  type ImportDetail,
  type ImportList,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { Env } from '../env.js';
import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { importTemplate } from '../services/import-file.js';
import {
  cancelImport,
  commitImport,
  listImports,
  loadImport,
  uploadImport,
} from '../services/imports.js';

const params = z.object({ id: z.uuid() });
/** RG-IMP-08: the manager and the admin import; a stocktake is the manager's alone. */
const IMPORTERS = ['manager', 'admin'] as const;

/** Catalog import from Excel (T-020; RG-IMP-01 à 08). */
export const importRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  const preHandler = requireRole(...IMPORTERS);

  app.get('/imports', { preHandler }, async (): Promise<ImportList> => listImports(app.db));

  app.get('/imports/template', { preHandler }, async (_request, reply) =>
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', 'attachment; filename="modele-import-articles.xlsx"')
      .send(await importTemplate()),
  );

  app.get('/imports/:id', { preHandler }, async (request): Promise<ImportDetail> =>
    loadImport(app.db, params.parse(request.params).id),
  );

  // The file travels base64 in JSON: a third more than its own size, and some room.
  app.post('/imports', { preHandler, bodyLimit: IMPORT_MAX_BYTES * 2 }, async (request, reply) => {
    const body = importUploadSchema.parse(request.body);
    const id = await uploadImport(app.db, env.FILES_DIR, actorOf(authOf(request)), body);
    return reply.code(201).send(await loadImport(app.db, id));
  });

  app.post('/imports/:id/cancel', { preHandler }, async (request): Promise<ImportDetail> => {
    const { id } = params.parse(request.params);
    await cancelImport(app.db, actorOf(authOf(request)), id);
    return loadImport(app.db, id);
  });

  app.post('/imports/:id/commit', { preHandler }, async (request): Promise<ImportDetail> => {
    const { id } = params.parse(request.params);
    await commitImport(
      app.db,
      actorOf(authOf(request)),
      id,
      importCommitSchema.parse(request.body ?? {}),
    );
    return loadImport(app.db, id);
  });
};
