import {
  customerReservationDaysSchema,
  generalReservationDaysSchema,
  type ReservationDays,
} from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { actorOf, authOf, requireRole } from '../plugins/session.js';
import {
  reservationDays,
  setCustomerReservationDays,
  setGeneralReservationDays,
} from '../services/reservation-days.js';

const params = z.object({ id: z.uuid() });
/** RG-STK-02, RG-DSH-07, annexe B: the admin and the owner set them, the manager reads them. */
const readers = { preHandler: requireRole('admin', 'manager', 'owner') };
const setters = { preHandler: requireRole('admin', 'owner') };

/** Reservation durations (T-022b, H45): general, and a customer's own that prevails. */
export const reservationDaysRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reservation-days', readers, async (): Promise<ReservationDays> =>
    reservationDays(app.db),
  );

  app.put('/reservation-days', setters, async (request): Promise<ReservationDays> => {
    const { days } = generalReservationDaysSchema.parse(request.body);
    await setGeneralReservationDays(app.db, actorOf(authOf(request)), days);
    return reservationDays(app.db);
  });

  app.put('/customers/:id/reservation-days', setters, async (request): Promise<ReservationDays> => {
    const { id } = params.parse(request.params);
    const { days } = customerReservationDaysSchema.parse(request.body);
    await setCustomerReservationDays(app.db, actorOf(authOf(request)), id, days);
    return reservationDays(app.db);
  });
};
