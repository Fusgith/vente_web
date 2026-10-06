import { reservationDaysResultSchema, type ReservationDays } from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** Reservation duration (T-022b, RG-STK-02, H45): read by the manager, set by the admin and the owner. */
export const reservationDaysApi = {
  async list(): Promise<ReservationDays> {
    return parseResponse(reservationDaysResultSchema, await apiRequest('/reservation-days'));
  },
  async setGeneral(days: number): Promise<ReservationDays> {
    return parseResponse(
      reservationDaysResultSchema,
      await apiRequest('/reservation-days', { method: 'PUT', body: { days } }),
    );
  },
  /** null gives the customer the general duration back. */
  async setCustomer(customerId: string, days: number | null): Promise<ReservationDays> {
    return parseResponse(
      reservationDaysResultSchema,
      await apiRequest(`/customers/${customerId}/reservation-days`, {
        method: 'PUT',
        body: { days },
      }),
    );
  },
};
