import { licenseKeyInputSchema, type LicenseStatus } from '@vente-web/shared';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../errors.js';
import { authRateLimit } from './rate-limit.js';

const UNCHECKED: LicenseStatus = { state: 'unchecked', machine: null, client: null, expires: null };

const REFUSALS = {
  missing: 'LICENSE_KEY_INVALID',
  invalid: 'LICENSE_KEY_INVALID',
  'other-machine': 'LICENSE_KEY_OTHER_MACHINE',
  expired: 'LICENSE_KEY_EXPIRED',
  clock: 'LICENSE_CLOCK',
} as const;

/** The lock screen's route, open without an account even while locked (ADR-0010, T-101). */
export const licenseRoutes: FastifyPluginAsync = async (app) => {
  app.get('/license', async (): Promise<LicenseStatus> =>
    app.license === null ? UNCHECKED : app.license.status(),
  );

  // A key is a secret to guess: the same limit as a password.
  app.post('/license', authRateLimit, async (request): Promise<LicenseStatus> => {
    const { key } = licenseKeyInputSchema.parse(request.body);
    if (app.license === null) return UNCHECKED;
    const status = await app.license.enter(key);
    if (status.state === 'valid' || status.state === 'unchecked') return status;
    throw new AppError(422, REFUSALS[status.state]);
  });
};
