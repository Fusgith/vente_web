import { readFile, statfs } from 'node:fs/promises';

import type { FastifyPluginAsync } from 'fastify';

import type { Env } from '../env.js';
import { API_VERSION } from '../version.js';

async function diskFreePercent(path: string): Promise<number | null> {
  try {
    const disk = await statfs(path);
    return Math.round((disk.bavail / disk.blocks) * 100);
  } catch {
    return null;
  }
}

async function lastBackupAt(file: string): Promise<string | null> {
  try {
    const at = new Date((await readFile(file, 'utf8')).trim());
    return Number.isNaN(at.getTime()) ? null : at.toISOString();
  } catch {
    return null;
  }
}

/**
 * Probe of the installer, the end-to-end tests and the OVH relay's monitoring (CDC technique
 * §10.5, T-082): the database answers, free space on the issued files' disk, last complete
 * backup. No auth: nothing here is business data. 503 when the database does not answer.
 */
export const healthRoutes: FastifyPluginAsync<{ env: Env }> = async (app, { env }) => {
  app.get('/healthz', async (_request, reply) => {
    const database = await app.db.$queryRaw`SELECT 1`.then(
      () => 'ok' as const,
      () => 'error' as const,
    );
    if (database !== 'ok') reply.code(503);
    return {
      status: database,
      version: API_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      database,
      diskFreePercent: await diskFreePercent(env.FILES_DIR),
      ...(env.BACKUP_STATUS_FILE === undefined
        ? {}
        : { lastBackupAt: await lastBackupAt(env.BACKUP_STATUS_FILE) }),
    };
  });
};
