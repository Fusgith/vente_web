import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';

const DATABASE_URL = 'postgresql://vente:vente@localhost:5432/vente_web_test';

describe('GET /healthz', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({ NODE_ENV: 'test', DATABASE_URL }),
      fastify: { logger: false },
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

describe('loadEnv', () => {
  it('applies defaults and coerces the port', () => {
    const env = loadEnv({ API_PORT: '4000', DATABASE_URL });
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects an invalid port', () => {
    expect(() => loadEnv({ API_PORT: 'abc', DATABASE_URL })).toThrow(/Invalid environment/);
  });

  it('requires a PostgreSQL DATABASE_URL (ADR-0001: one master database)', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });
});
