import { describe, expect, it } from 'vitest';

import { isCsrfSafe, type CsrfInput } from './csrf.js';

const base: CsrfInput = {
  method: 'POST',
  secFetchSite: undefined,
  origin: undefined,
  protocol: 'https',
  host: 'vente.local',
};

describe('isCsrfSafe (CDC technique §8: fail-closed CSRF rule)', () => {
  it('lets safe methods through whatever the headers', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(isCsrfSafe({ ...base, method, secFetchSite: 'cross-site' })).toBe(true);
    }
  });

  it('rejects a state-changing request carrying no proof of origin', () => {
    expect(isCsrfSafe(base)).toBe(false);
    expect(isCsrfSafe({ ...base, method: 'PUT' })).toBe(false);
    expect(isCsrfSafe({ ...base, method: 'DELETE' })).toBe(false);
  });

  it('trusts Sec-Fetch-Site same-origin or none, nothing else', () => {
    expect(isCsrfSafe({ ...base, secFetchSite: 'same-origin' })).toBe(true);
    expect(isCsrfSafe({ ...base, secFetchSite: 'none' })).toBe(true);
    expect(isCsrfSafe({ ...base, secFetchSite: 'same-site' })).toBe(false);
    expect(isCsrfSafe({ ...base, secFetchSite: 'cross-site' })).toBe(false);
    expect(isCsrfSafe({ ...base, secFetchSite: ['same-origin', 'cross-site'] })).toBe(false);
  });

  it('believes a browser that says cross-site or same-site, whatever its Origin', () => {
    const origin = 'https://vente.local';
    expect(isCsrfSafe({ ...base, origin, secFetchSite: 'cross-site' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin, secFetchSite: 'same-site' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin, secFetchSite: '' })).toBe(false);
  });

  it('accepts an Origin that is exactly our host, with or without the default port', () => {
    expect(isCsrfSafe({ ...base, origin: 'https://vente.local' })).toBe(true);
    expect(isCsrfSafe({ ...base, origin: 'https://vente.local', host: 'vente.local:443' })).toBe(
      true,
    );
    const http = { ...base, protocol: 'http' };
    expect(isCsrfSafe({ ...http, origin: 'http://localhost:80', host: 'localhost:80' })).toBe(true);
    expect(isCsrfSafe({ ...http, origin: 'http://localhost', host: 'localhost:80' })).toBe(true);
    expect(isCsrfSafe({ ...http, origin: 'http://localhost:3000', host: 'localhost:3000' })).toBe(
      true,
    );
  });

  it('rejects a foreign, malformed, null or multi-valued Origin', () => {
    expect(isCsrfSafe({ ...base, origin: 'https://evil.example' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin: 'https://vente.local.evil.example' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin: 'https://vente.local:8443' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin: 'http://localhost:80', host: 'localhost:443' })).toBe(
      false,
    );
    // Same host, other scheme: a plain-HTTP page is another origin.
    expect(isCsrfSafe({ ...base, origin: 'http://vente.local' })).toBe(false);
    expect(isCsrfSafe({ ...base, protocol: 'http', origin: 'https://vente.local' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin: 'null' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin: 'not a url' })).toBe(false);
    expect(isCsrfSafe({ ...base, origin: ['https://vente.local'] })).toBe(false);
  });
});
