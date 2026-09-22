import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

const DATABASE_URL = 'postgresql://vente:vente@localhost:5432/vente_web_test';

describe('loadEnv', () => {
  it('applies defaults and coerces the port', () => {
    const env = loadEnv({ API_PORT: '4000', DATABASE_URL });
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.AUTH_SESSION_HOURS).toBe(12);
    expect(env.AUTH_DEFAULT_ORIGIN).toBe('LAN');
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_PROXY.entries).toEqual(['127.0.0.1', '::1']);
  });

  it('rejects an invalid port', () => {
    expect(() => loadEnv({ API_PORT: 'abc', DATABASE_URL })).toThrow(/Invalid environment/);
  });

  it('requires a PostgreSQL DATABASE_URL (ADR-0001: one master database)', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('secures the cookie by default in production, and only there', () => {
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL }).COOKIE_SECURE).toBe(true);
    expect(
      loadEnv({ NODE_ENV: 'production', DATABASE_URL, COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
    expect(loadEnv({ NODE_ENV: 'test', DATABASE_URL, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(
      true,
    );
  });

  it('assumes LAN outside production, never in production (fail-closed, CDC technique 2.2)', () => {
    expect(
      loadEnv({ NODE_ENV: 'test', DATABASE_URL, AUTH_DEFAULT_ORIGIN: 'REMOTE' })
        .AUTH_DEFAULT_ORIGIN,
    ).toBe('REMOTE');
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL }).AUTH_DEFAULT_ORIGIN).toBeUndefined();
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DATABASE_URL, AUTH_DEFAULT_ORIGIN: 'LAN' }),
    ).toThrow(/AUTH_DEFAULT_ORIGIN/);
    expect(() => loadEnv({ DATABASE_URL, AUTH_DEFAULT_ORIGIN: 'shop' })).toThrow(
      /AUTH_DEFAULT_ORIGIN/,
    );
  });

  it('treats an empty value as unset (a blank line in .env is not a setting)', () => {
    const env = loadEnv({
      DATABASE_URL,
      AUTH_DEFAULT_ORIGIN: '',
      COOKIE_SECURE: ' ',
      TRUST_PROXY: '',
    });
    expect(env.AUTH_DEFAULT_ORIGIN).toBe('LAN');
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_PROXY.entries).toEqual(['127.0.0.1', '::1']);
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL, COOKIE_SECURE: '' }).COOKIE_SECURE).toBe(
      true,
    );
  });

  it('parses TRUST_PROXY as addresses and CIDR ranges', () => {
    const env = loadEnv({ DATABASE_URL, TRUST_PROXY: '10.0.0.0/8, 172.18.0.5' });
    expect(env.TRUST_PROXY.isTrusted('10.20.30.40')).toBe(true);
    expect(env.TRUST_PROXY.isTrusted('172.18.0.5')).toBe(true);
    expect(env.TRUST_PROXY.isTrusted('127.0.0.1')).toBe(false);
    expect(() => loadEnv({ DATABASE_URL, TRUST_PROXY: 'proxy.local' })).toThrow(/TRUST_PROXY/);
  });

  it('bounds the session lifetime', () => {
    expect(loadEnv({ DATABASE_URL, AUTH_SESSION_HOURS: '48' }).AUTH_SESSION_HOURS).toBe(48);
    expect(() => loadEnv({ DATABASE_URL, AUTH_SESSION_HOURS: '0' })).toThrow(/AUTH_SESSION_HOURS/);
  });
});
