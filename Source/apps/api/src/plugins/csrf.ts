import fp from 'fastify-plugin';

import { AppError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfInput {
  method: string;
  secFetchSite: string | string[] | undefined;
  origin: string | string[] | undefined;
  /** `request.protocol`: `http`/`https`, from X-Forwarded-Proto behind the trusted proxy. */
  protocol: string;
  /** `request.host`: Host header, or X-Forwarded-Host behind the trusted proxy. */
  host: string;
}

/**
 * Fail-closed CSRF rule (CDC technique §8): a state-changing request is accepted only when the
 * browser proves it is first-party — `Sec-Fetch-Site: same-origin` (or `none`, a typed URL /
 * bookmark) — or, when the browser sends no `Sec-Fetch-Site` at all, when its `Origin` is
 * exactly ours (scheme and host). Any other `Sec-Fetch-Site` value is believed over the Origin;
 * no header at all is a rejection, so a non-browser client must send one of them explicitly.
 */
export function isCsrfSafe(input: CsrfInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  if (input.secFetchSite !== undefined) {
    return input.secFetchSite === 'same-origin' || input.secFetchSite === 'none';
  }
  if (typeof input.origin !== 'string') return false;
  try {
    const origin = new URL(input.origin);
    if (origin.protocol !== `${input.protocol}:`) return false;
    // `URL` drops the scheme's default port; a Host header may still carry it explicitly.
    const defaultPort = origin.protocol === 'https:' ? ':443' : ':80';
    const host = input.host.endsWith(defaultPort)
      ? input.host.slice(0, -defaultPort.length)
      : input.host;
    return origin.host === host;
  } catch {
    return false;
  }
}

export const csrfPlugin = fp(
  async (app) => {
    app.addHook('onRequest', async (request) => {
      const safe = isCsrfSafe({
        method: request.method,
        secFetchSite: request.headers['sec-fetch-site'],
        origin: request.headers.origin,
        protocol: request.protocol,
        host: request.host,
      });
      if (!safe) throw new AppError(403, 'CSRF_REJECTED');
    });
  },
  { name: 'csrf' },
);
