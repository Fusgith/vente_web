import type { IncomingMessage } from 'node:http';

import { describe, expect, it } from 'vitest';

import { loadEnv } from '../env.js';
import { isFirstParty } from './realtime.js';

const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/vente' });

/** A WebSocket handshake as Node hands it over: its headers and the peer that sent it. */
function handshake(
  headers: Record<string, string>,
  remoteAddress = '192.168.1.20',
): IncomingMessage {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe('isFirstParty: realtime handshake from the shop page only (CDC technique §8)', () => {
  it('accepts the page of the same origin, refuses any other or none', () => {
    const host = 'vente.local:5173';
    expect(isFirstParty(handshake({ host, origin: 'http://vente.local:5173' }), env)).toBe(true);
    expect(isFirstParty(handshake({ host, origin: 'http://evil.example' }), env)).toBe(false);
    expect(isFirstParty(handshake({ host, origin: 'https://vente.local:5173' }), env)).toBe(false);
    expect(isFirstParty(handshake({ host }), env)).toBe(false);
  });

  it('believes a cross-site Sec-Fetch-Site over a matching Origin', () => {
    const headers = { host: 'vente.local', origin: 'http://vente.local' };
    expect(isFirstParty(handshake({ ...headers, 'sec-fetch-site': 'same-origin' }), env)).toBe(
      true,
    );
    expect(isFirstParty(handshake({ ...headers, 'sec-fetch-site': 'same-site' }), env)).toBe(false);
  });

  it('reads the scheme and host the browser used from the trusted proxy only', () => {
    const behindCaddy = {
      host: 'api:3000',
      origin: 'https://vente.magasin.mg',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'vente.magasin.mg',
    };
    expect(isFirstParty(handshake(behindCaddy, '127.0.0.1'), env)).toBe(true);
    // The same headers from any other peer are the client's own claim: ignored.
    expect(isFirstParty(handshake(behindCaddy, '192.168.1.20'), env)).toBe(false);
  });
});
