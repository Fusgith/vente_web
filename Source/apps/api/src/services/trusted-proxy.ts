import { BlockList, isIP } from 'node:net';

/**
 * Peers allowed to assert the access origin and the client address (CDC technique §2.2):
 * the reverse proxy in front of the API, nothing else. Entries are IPs or CIDR blocks.
 */
export interface TrustedProxies {
  /** Normalised entries, in the form Fastify's `trustProxy` accepts. */
  readonly entries: readonly string[];
  isTrusted(address: string | undefined): boolean;
}

function parseEntry(entry: string, list: BlockList): void {
  const [address, prefix, ...rest] = entry.split('/');
  const family = address ? isIP(address) : 0;
  if (!address || family === 0 || rest.length > 0) {
    throw new RangeError(`Invalid address or CIDR block: "${entry}"`);
  }
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (prefix === undefined) {
    list.addAddress(address, type);
    return;
  }
  const bits = Number(prefix);
  const maxBits = family === 4 ? 32 : 128;
  if (!/^\d{1,3}$/.test(prefix) || bits > maxBits) {
    throw new RangeError(`Invalid CIDR prefix: "${entry}"`);
  }
  list.addSubnet(address, bits, type);
}

/** Parses a comma-separated list such as `127.0.0.1,::1,10.0.0.0/8`. Throws on any bad entry. */
export function parseTrustedProxies(spec: string): TrustedProxies {
  const list = new BlockList();
  const entries = spec
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const entry of entries) parseEntry(entry, list);
  return {
    entries,
    isTrusted(address) {
      if (!address) return false;
      const family = isIP(address);
      if (family === 0) return false;
      // An IPv4 peer of a dual-stack socket shows up as `::ffff:a.b.c.d`; BlockList maps it back.
      return list.check(address, family === 4 ? 'ipv4' : 'ipv6');
    },
  };
}
