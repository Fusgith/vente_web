import { describe, expect, it } from 'vitest';

import { resolveAccessOrigin } from './access-origin.js';
import { parseTrustedProxies } from './trusted-proxy.js';

describe('parseTrustedProxies', () => {
  it('accepts addresses and CIDR blocks, IPv4 and IPv6', () => {
    const proxies = parseTrustedProxies('127.0.0.1, ::1,10.0.0.0/8,fd00::/8');
    expect(proxies.entries).toEqual(['127.0.0.1', '::1', '10.0.0.0/8', 'fd00::/8']);
    expect(proxies.isTrusted('127.0.0.1')).toBe(true);
    expect(proxies.isTrusted('::1')).toBe(true);
    expect(proxies.isTrusted('10.255.0.7')).toBe(true);
    expect(proxies.isTrusted('fd00:1::2')).toBe(true);
    expect(proxies.isTrusted('11.0.0.1')).toBe(false);
    expect(proxies.isTrusted('192.168.1.10')).toBe(false);
  });

  it('recognises an IPv4 peer of a dual-stack socket', () => {
    const proxies = parseTrustedProxies('127.0.0.1');
    expect(proxies.isTrusted('::ffff:127.0.0.1')).toBe(true);
    expect(proxies.isTrusted('::ffff:10.0.0.1')).toBe(false);
  });

  it('trusts nobody on an empty list, an unknown or malformed peer', () => {
    const none = parseTrustedProxies('');
    expect(none.entries).toEqual([]);
    expect(none.isTrusted('127.0.0.1')).toBe(false);
    const some = parseTrustedProxies('127.0.0.1');
    expect(some.isTrusted(undefined)).toBe(false);
    expect(some.isTrusted('')).toBe(false);
    expect(some.isTrusted('proxy.local')).toBe(false);
  });

  it('throws on a bad entry rather than silently trusting less or more', () => {
    expect(() => parseTrustedProxies('proxy.local')).toThrow(RangeError);
    expect(() => parseTrustedProxies('10.0.0.0/33')).toThrow(RangeError);
    expect(() => parseTrustedProxies('::1/129')).toThrow(RangeError);
    expect(() => parseTrustedProxies('10.0.0.0/8/1')).toThrow(RangeError);
    expect(() => parseTrustedProxies('10.0.0.0/x')).toThrow(RangeError);
    expect(() => parseTrustedProxies('/8')).toThrow(RangeError);
  });
});

describe('resolveAccessOrigin (CDC technique §2.2: fail-closed, REMOTE unless proven LAN)', () => {
  const trustedProxies = parseTrustedProxies('127.0.0.1,::1');
  const fromProxy = { remoteAddress: '127.0.0.1', trustedProxies, defaultOrigin: undefined };

  it('reads the header set by a trusted proxy, case-insensitively', () => {
    expect(resolveAccessOrigin({ ...fromProxy, header: 'lan' })).toBe('LAN');
    expect(resolveAccessOrigin({ ...fromProxy, header: ' LAN ' })).toBe('LAN');
    expect(resolveAccessOrigin({ ...fromProxy, header: 'remote' })).toBe('REMOTE');
    expect(resolveAccessOrigin({ ...fromProxy, header: 'shop' })).toBe('REMOTE');
    expect(resolveAccessOrigin({ ...fromProxy, header: ['lan', 'lan'] })).toBe('REMOTE');
  });

  it('ignores the header from an untrusted or unknown peer', () => {
    expect(resolveAccessOrigin({ ...fromProxy, header: 'lan', remoteAddress: '203.0.113.5' })).toBe(
      'REMOTE',
    );
    expect(resolveAccessOrigin({ ...fromProxy, header: 'lan', remoteAddress: undefined })).toBe(
      'REMOTE',
    );
  });

  it('falls back to the configured default only when the header is absent', () => {
    expect(resolveAccessOrigin({ ...fromProxy, header: undefined })).toBe('REMOTE');
    expect(resolveAccessOrigin({ ...fromProxy, header: undefined, defaultOrigin: 'LAN' })).toBe(
      'LAN',
    );
    expect(
      resolveAccessOrigin({
        ...fromProxy,
        header: undefined,
        defaultOrigin: 'LAN',
        remoteAddress: '203.0.113.5',
      }),
    ).toBe('LAN');
    expect(resolveAccessOrigin({ ...fromProxy, header: 'remote', defaultOrigin: 'LAN' })).toBe(
      'REMOTE',
    );
  });
});
