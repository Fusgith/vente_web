import { SETTING_KEYS, settingUpdateSchema, type Settings } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import { listSettings, writeSetting } from '../services/settings-admin.js';

const keyParams = z.object({ key: z.enum(SETTING_KEYS) });

/** The « Paramètres » screen (CDC métier §13, T-013): read by the managers, set by the admin. */
export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/settings',
    { preHandler: requirePermission('settings.read') },
    async (): Promise<Settings> => listSettings(app.db),
  );

  app.put(
    '/settings/:key',
    { preHandler: requirePermission('settings.edit') },
    async (request): Promise<Settings> => {
      const { key } = keyParams.parse(request.params);
      const { value } = settingUpdateSchema.parse(request.body);
      await writeSetting(app.db, actorOf(authOf(request)), key, value);
      return listSettings(app.db);
    },
  );
};
