import type { LicenseStatus } from '@vente-web/shared';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { AppError } from '../errors.js';
import { LICENSE_PUBLIC_KEY } from '../license-key.js';
import { evaluateLicense, machineCode } from '../services/license.js';

/** Setting row with the key entered and the latest moment the server saw (ADR-0010). */
export const LICENSE_SETTING = 'license';
/** Each request reads a status at most this old. */
const CACHE_MS = 60_000;
/** The latest moment seen moves forward at most once an hour: one write, not one per request. */
const LAST_SEEN_STEP_MS = 60 * 60 * 1000;
/** The only API path open while the application is locked: the lock screen's. */
const OPEN_PATH = '/api/v1/license';

const storedSchema = z.object({ key: z.string().nullable(), lastSeen: z.iso.datetime() });

export interface LicenseOptions {
  /** Tests bring their own vendor key; null: unchecked. The built-in one otherwise. */
  publicKey?: string | null;
  /** Tests fix this server's code; read from Windows otherwise. */
  machine?: string;
  now?: () => Date;
}

export interface LicenseGuard {
  status(): Promise<LicenseStatus>;
  /** Keeps the key when it lets the application run here; the status says why not otherwise. */
  enter(key: string): Promise<LicenseStatus>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** null when no vendor key is built in (development, tests). */
    license: LicenseGuard | null;
  }
}

/**
 * Trial license of a package sold before the vendor's server exists (ADR-0010, T-101): the
 * whole API but the lock screen's route answers LICENSE_REQUIRED until a key signed for this
 * server, still running, with the clock not turned back, is entered.
 */
export const licensePlugin = fp<LicenseOptions>(
  async (app, options) => {
    const publicKey = options.publicKey === undefined ? LICENSE_PUBLIC_KEY : options.publicKey;
    if (publicKey === null) {
      app.decorate('license', null);
      return;
    }
    const machine = options.machine ?? machineCode();
    const now = options.now ?? (() => new Date());

    const read = async () => {
      const row = await app.db.setting.findUnique({
        where: { key: LICENSE_SETTING },
        select: { value: true },
      });
      const stored = storedSchema.safeParse(row?.value);
      return stored.success
        ? { key: stored.data.key, lastSeen: new Date(stored.data.lastSeen) }
        : { key: null, lastSeen: null };
    };
    const write = async (key: string | null, lastSeen: Date) => {
      const value = { key, lastSeen: lastSeen.toISOString() };
      await app.db.setting.upsert({
        where: { key: LICENSE_SETTING },
        create: { key: LICENSE_SETTING, value },
        update: { value },
      });
    };

    let cached: { status: LicenseStatus; at: number } | null = null;
    const guard: LicenseGuard = {
      async status() {
        const at = now();
        const age = cached === null ? Infinity : at.getTime() - cached.at;
        if (cached !== null && age >= 0 && age < CACHE_MS) return cached.status;
        const stored = await read();
        const status = evaluateLicense({ ...stored, publicKey, machine, now: at });
        const step = stored.lastSeen === null ? Infinity : at.getTime() - stored.lastSeen.getTime();
        if (step > LAST_SEEN_STEP_MS) await write(stored.key, at);
        cached = { status, at: at.getTime() };
        return status;
      },
      async enter(key) {
        const at = now();
        const { lastSeen } = await read();
        const status = evaluateLicense({ key, lastSeen, publicKey, machine, now: at });
        if (status.state === 'valid') {
          await write(key.trim(), lastSeen !== null && lastSeen > at ? lastSeen : at);
          cached = null;
        }
        return status;
      },
    };
    app.decorate('license', guard);

    app.addHook('onRequest', async (request) => {
      const path = request.url.split('?', 1)[0] ?? '';
      if (!path.startsWith('/api/') || path === OPEN_PATH) return;
      if ((await guard.status()).state !== 'valid') throw new AppError(403, 'LICENSE_REQUIRED');
    });
  },
  { name: 'license', dependencies: ['db'] },
);
