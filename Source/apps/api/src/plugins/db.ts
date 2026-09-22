import fp from 'fastify-plugin';

import type { Db } from '../db.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export interface DbPluginOptions {
  db: Db;
  /** Disconnect the client when the app closes (false when the caller owns it, e.g. tests). */
  ownsClient: boolean;
}

/** Exposes the Prisma client as `app.db`; injectable so tests point it at their own database. */
export const dbPlugin = fp<DbPluginOptions>(
  async (app, options) => {
    app.decorate('db', options.db);
    if (options.ownsClient) {
      app.addHook('onClose', async () => {
        await options.db.$disconnect();
      });
    }
  },
  { name: 'db' },
);
