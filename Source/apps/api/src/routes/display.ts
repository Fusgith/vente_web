import type { DisplayBoard } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { findDisplay, loadBoard } from '../services/display.js';

const displayParams = z.object({ key: z.string().min(1).max(64) });

/**
 * The public display reads its board with its station key, no account (RG-DSP-03): read only,
 * tickets and stations, nothing else of the shop.
 */
export const displayRoutes: FastifyPluginAsync = async (app) => {
  app.get('/display/:key', async (request): Promise<DisplayBoard> => {
    const { key } = displayParams.parse(request.params);
    if (!(await findDisplay(app.db, key))) throw new AppError(404, 'NOT_FOUND');
    return loadBoard(app.db);
  });
};
