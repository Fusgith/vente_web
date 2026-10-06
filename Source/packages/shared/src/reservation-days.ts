import { z } from 'zod';

/** A technical bound only: H45 speaks of an evening or a few days. */
export const RESERVATION_DAYS_MAX = 365;

/**
 * Days an order stays reserved after the day it is validated on (RG-STK-02, H45): 0 keeps it
 * until that day's end, 2 until the end of the day after next.
 */
export const reservationDaysSchema = z.number().int().min(0).max(RESERVATION_DAYS_MAX);

/** The general duration, set by the admin or the owner (`reservation_days`). */
export const generalReservationDaysSchema = z.object({ days: reservationDaysSchema });

/** A customer's own duration, a particular condition that prevails; null: the general one. */
export const customerReservationDaysSchema = z.object({
  days: reservationDaysSchema.nullable(),
});

/** The general duration and the customers who have their own. */
export const reservationDaysResultSchema = z.object({
  days: reservationDaysSchema,
  customers: z.array(
    z.object({ id: z.uuid(), name: z.string(), phone: z.string(), days: reservationDaysSchema }),
  ),
});
export type ReservationDays = z.infer<typeof reservationDaysResultSchema>;
