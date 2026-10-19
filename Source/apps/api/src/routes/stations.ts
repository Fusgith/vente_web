import {
  createStationSchema,
  updateStationSchema,
  type Station,
  type StationList,
  type StationPairing,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import { createStation, listStations, pairStation, updateStation } from '../services/stations.js';

const params = z.object({ id: z.uuid() });
/** Annexe B: the admin declares the stations and pairs the devices (RG-USR-09). */
const admin = { preHandler: requireRole('admin') };

/** The shop's stations and the pairing of their devices (T-015, H71). */
export const stationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stations', admin, async (): Promise<StationList> => ({
    items: await listStations(app.db),
  }));

  app.post('/stations', admin, async (request, reply): Promise<Station> => {
    const input = createStationSchema.parse(request.body);
    return reply.code(201).send(await createStation(app.db, actorOf(authOf(request)), input));
  });

  app.patch('/stations/:id', admin, async (request): Promise<Station> => {
    const { id } = params.parse(request.params);
    const input = updateStationSchema.parse(request.body);
    return updateStation(app.db, actorOf(authOf(request)), id, input);
  });

  /** Called from the device being paired: the key goes back to it alone, once. */
  app.post('/stations/:id/pair', admin, async (request): Promise<StationPairing> => {
    const { id } = params.parse(request.params);
    return pairStation(app.db, actorOf(authOf(request)), id);
  });
};
