/**
 * The shop's stations (T-015, RG-USR-09, H21, H71): tablets, registers, delivery counters and the
 * public display. The admin declares them and pairs each device to its station from the device
 * itself; a paired device sends its key at login, never a bare station id.
 */
import { z } from 'zod';

export const STATION_TYPES = ['SALES', 'REGISTER', 'DELIVERY', 'DISPLAY'] as const;
export const stationTypeSchema = z.enum(STATION_TYPES);
export type StationType = z.infer<typeof stationTypeSchema>;

const name = z.string().trim().min(1).max(80);

export const stationSchema = z.object({
  id: z.uuid(),
  type: stationTypeSchema,
  name: z.string(),
  isActive: z.boolean(),
  /** The public display's address key (`/ecran/<key>`); null for other stations. */
  displayKey: z.string().nullable(),
  /** When a device was last paired to it; null while none is. */
  pairedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Station = z.infer<typeof stationSchema>;

export const stationListSchema = z.object({ items: z.array(stationSchema) });
export type StationList = z.infer<typeof stationListSchema>;

export const createStationSchema = z.object({ type: stationTypeSchema, name }).strict();
export type CreateStation = z.infer<typeof createStationSchema>;

export const updateStationSchema = z
  .object({ name: name.optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((body) => body.name !== undefined || body.isActive !== undefined);
export type UpdateStation = z.infer<typeof updateStationSchema>;

/** Returned once by `POST /stations/:id/pair`: the device keeps the key, the server its hash. */
export const stationPairingSchema = z.object({ station: stationSchema, key: z.string() });
export type StationPairing = z.infer<typeof stationPairingSchema>;
