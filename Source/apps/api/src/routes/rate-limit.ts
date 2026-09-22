import type { RouteShorthandOptions } from 'fastify';

/** Attempts per minute and address, by origin (⚠️ H19): tight outside, roomy on shared stations. */
export const AUTH_MAX_PER_MINUTE = { LAN: 60, REMOTE: 10 } as const;

/** Route option for the endpoints that guess secrets or list accounts (CDC technique §8). */
export const authRateLimit: RouteShorthandOptions = {
  config: {
    rateLimit: {
      max: (request) => AUTH_MAX_PER_MINUTE[request.accessOrigin],
      timeWindow: 60_000,
    },
  },
};
