import {
  kioskBasketInputSchema,
  productSearchQuerySchema,
  type KioskBasketList,
  type KioskBasketSent,
  type KioskBasketTaken,
  type KioskHome,
  type KioskSearchResult,
} from '@vente-web/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { actorOf, authOf, requirePermission } from '../plugins/session.js';
import {
  findKiosk,
  kioskHome,
  kioskSearch,
  pendingBaskets,
  sendBasket,
  takeBasket,
} from '../services/kiosk.js';
import { kioskBasketClaimed, kioskBasketCreated } from '../services/realtime-rooms.js';

const keyParams = z.object({ key: z.string().min(1).max(64) });
const idParams = z.object({ id: z.uuid() });

/**
 * The kiosk (RG-BOR-01): no account, its station key in the address; it reads the sellable
 * catalogue and sends baskets, nothing else. The salespeople take the baskets up (RG-BOR-05).
 */
export const kioskRoutes: FastifyPluginAsync = async (app) => {
  async function kioskOf(request: FastifyRequest) {
    const { key } = keyParams.parse(request.params);
    const kiosk = await findKiosk(app.db, key);
    if (!kiosk) throw new AppError(404, 'NOT_FOUND');
    return kiosk;
  }

  app.get('/kiosk/:key', async (request): Promise<KioskHome> => {
    return kioskHome(app.db, await kioskOf(request));
  });

  app.get('/kiosk/:key/search', async (request): Promise<KioskSearchResult> => {
    await kioskOf(request);
    return kioskSearch(app.db, productSearchQuerySchema.parse(request.query));
  });

  app.post('/kiosk/:key/baskets', async (request, reply): Promise<KioskBasketSent> => {
    const kiosk = await kioskOf(request);
    const sent = await sendBasket(app.db, kiosk.id, kioskBasketInputSchema.parse(request.body));
    app.realtime.publish(kioskBasketCreated(sent.id));
    reply.code(201);
    return { basket: sent.basket };
  });

  app.get(
    '/kiosk-baskets',
    { preHandler: requirePermission('kiosk.read') },
    async (): Promise<KioskBasketList> => ({ items: await pendingBaskets(app.db) }),
  );

  app.post(
    '/kiosk-baskets/:id/take',
    { preHandler: requirePermission('kiosk.take') },
    async (request): Promise<KioskBasketTaken> => {
      const { id } = idParams.parse(request.params);
      const quoteId = await takeBasket(app.db, actorOf(authOf(request)), id);
      app.realtime.publish(kioskBasketClaimed(id));
      return { quoteId };
    },
  );
};
