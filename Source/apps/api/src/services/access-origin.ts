import type { AccessOrigin } from '@vente-web/shared';

import type { TrustedProxies } from './trusted-proxy.js';

/** Header set by the reverse proxy on each listener (CDC technique §2.2): `lan` or `remote`. */
export const ACCESS_ORIGIN_HEADER = 'x-access-origin';

export interface ResolveOriginInput {
  /** Raw header value as Fastify exposes it. */
  header: string | string[] | undefined;
  /** Address of the socket peer — the proxy, or a direct client when misconfigured. */
  remoteAddress: string | undefined;
  trustedProxies: TrustedProxies;
  /** Applies only when the header is absent; unset in production (env validation). */
  defaultOrigin: AccessOrigin | undefined;
}

/**
 * Fail-closed origin resolution: anything not positively asserted by a trusted proxy is REMOTE.
 * A direct client can therefore never pretend to be inside the shop, while a missing proxy
 * header in development still yields LAN through `AUTH_DEFAULT_ORIGIN`.
 */
export function resolveAccessOrigin(input: ResolveOriginInput): AccessOrigin {
  const { header } = input;
  if (header === undefined) return input.defaultOrigin ?? 'REMOTE';
  if (Array.isArray(header) || !input.trustedProxies.isTrusted(input.remoteAddress)) {
    return 'REMOTE';
  }
  const value = header.trim().toLowerCase();
  if (value === 'lan') return 'LAN';
  return 'REMOTE';
}
