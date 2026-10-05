import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import webpush from 'web-push';
import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

const DATABASE_URL = 'postgresql://vente:vente@localhost:5432/vente_web_test';

describe('loadEnv', () => {
  it('applies defaults and coerces the port', () => {
    const env = loadEnv({ API_PORT: '4000', DATABASE_URL });
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.AUTH_SESSION_HOURS).toBe(12);
    expect(env.APP_NAME).toBe('Vente Web');
    expect(env.AUTH_DEFAULT_ORIGIN).toBe('LAN');
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_PROXY.entries).toEqual(['127.0.0.1', '::1']);
  });

  it('starts with the template as copied by the launcher (pnpm demarrer)', () => {
    const template = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
    expect(() => loadEnv(parseEnv(template))).not.toThrow();
  });

  it('rejects an invalid port', () => {
    expect(() => loadEnv({ API_PORT: 'abc', DATABASE_URL })).toThrow(/Invalid environment/);
  });

  it('requires a PostgreSQL DATABASE_URL (ADR-0001: one master database)', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('secures the cookie by default in production, and refuses to drop it there (§8)', () => {
    expect(loadEnv({ NODE_ENV: 'production', DATABASE_URL }).COOKIE_SECURE).toBe(true);
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL, COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE/,
    );
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

  it('bounds the session lifetime to the 12 hours of H19', () => {
    expect(loadEnv({ DATABASE_URL, AUTH_SESSION_HOURS: '8' }).AUTH_SESSION_HOURS).toBe(8);
    expect(() => loadEnv({ DATABASE_URL, AUTH_SESSION_HOURS: '0' })).toThrow(/AUTH_SESSION_HOURS/);
    expect(() => loadEnv({ DATABASE_URL, AUTH_SESSION_HOURS: '13' })).toThrow(/AUTH_SESSION_HOURS/);
  });

  it('reads the application name of the build (RG-APP-01)', () => {
    expect(loadEnv({ DATABASE_URL, APP_NAME: '  Épicerie   Rasoa ' }).APP_NAME).toBe(
      'Épicerie Rasoa',
    );
    expect(loadEnv({ DATABASE_URL, APP_NAME: '' }).APP_NAME).toBe('Vente Web');
    expect(() => loadEnv({ DATABASE_URL, APP_NAME: '<b>Rasoa</b>' })).toThrow(/APP_NAME/);
    expect(() => loadEnv({ DATABASE_URL, APP_NAME: 'x'.repeat(41) })).toThrow(/APP_NAME/);
  });

  describe('VAPID keys of the push notifications (T-033e)', () => {
    const pair = webpush.generateVAPIDKeys();
    const vapid = {
      VAPID_PUBLIC_KEY: pair.publicKey,
      VAPID_PRIVATE_KEY: pair.privateKey,
      VAPID_SUBJECT: 'mailto:boss@example.mg',
    };

    it('turns push off without them, on with all three', () => {
      expect(loadEnv({ DATABASE_URL }).VAPID).toBeNull();
      expect(loadEnv({ DATABASE_URL, VAPID_PUBLIC_KEY: ' ', VAPID_SUBJECT: '' }).VAPID).toBeNull();
      expect(loadEnv({ DATABASE_URL, ...vapid }).VAPID).toEqual({
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
        subject: 'mailto:boss@example.mg',
      });
      expect(
        loadEnv({ DATABASE_URL, ...vapid, VAPID_SUBJECT: 'https://magasin.example.mg' }).VAPID
          ?.subject,
      ).toBe('https://magasin.example.mg');
    });

    it('refuses a partial setting, naming what is missing', () => {
      expect(() => loadEnv({ DATABASE_URL, VAPID_PUBLIC_KEY: pair.publicKey })).toThrow(
        /VAPID_PRIVATE_KEY[\s\S]*VAPID_SUBJECT/,
      );
    });

    it('refuses malformed keys and a mixed-up pair, never echoing the private key', () => {
      const other = webpush.generateVAPIDKeys();
      const refused = (overrides: Record<string, string>) => {
        try {
          loadEnv({ DATABASE_URL, ...vapid, ...overrides });
        } catch (error) {
          return (error as Error).message;
        }
        throw new Error('accepted');
      };
      expect(refused({ VAPID_PUBLIC_KEY: other.publicKey })).toMatch(/VAPID_PUBLIC_KEY/);
      expect(refused({ VAPID_PRIVATE_KEY: 'abc' })).toMatch(/VAPID_PRIVATE_KEY/);
      expect(refused({ VAPID_PUBLIC_KEY: pair.publicKey.slice(1) })).toMatch(/VAPID_PUBLIC_KEY/);
      expect(refused({ VAPID_PRIVATE_KEY: other.privateKey })).not.toContain(other.privateKey);
    });

    it('wants a mailto: or https: contact (RFC 8292)', () => {
      // Apple refuses a localhost contact: the owner on an iPhone would get nothing.
      for (const subject of [
        'boss@example.mg',
        'http://magasin.example.mg',
        'mailto:boss',
        'https://localhost',
      ]) {
        expect(() => loadEnv({ DATABASE_URL, ...vapid, VAPID_SUBJECT: subject })).toThrow(
          /VAPID_SUBJECT/,
        );
      }
    });
  });
});
