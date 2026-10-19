import {
  stationListSchema,
  stationPairingSchema,
  stationSchema,
  type CreateStation,
  type Station,
  type StationPairing,
  type UpdateStation,
} from '@vente-web/shared';

import { apiRequest, parseResponse } from './client.js';

/** The shop's stations and the pairing of this device (T-015, H71): the admin's. */
export const stationsApi = {
  async list(): Promise<Station[]> {
    return parseResponse(stationListSchema, await apiRequest('/stations')).items;
  },
  async create(body: CreateStation): Promise<Station> {
    return parseResponse(stationSchema, await apiRequest('/stations', { method: 'POST', body }));
  },
  async update(id: string, body: UpdateStation): Promise<Station> {
    return parseResponse(
      stationSchema,
      await apiRequest(`/stations/${id}`, { method: 'PATCH', body }),
    );
  },
  async pair(id: string): Promise<StationPairing> {
    return parseResponse(
      stationPairingSchema,
      await apiRequest(`/stations/${id}/pair`, { method: 'POST' }),
    );
  },
};
