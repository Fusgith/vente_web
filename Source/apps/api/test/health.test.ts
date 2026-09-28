import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';

// The health check never touches the database: a placeholder URL is enough.
const DATABASE_URL = 'postgresql://vente:vente@localhost:5432/vente_web_test';

describe('GET /healthz', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({ NODE_ENV: 'test', DATABASE_URL }),
      fastify: { logger: false },
      expiry: { sweepMs: 0 },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it('answers 200 with status ok and the package version', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', version: expect.any(String) });
  });
});
