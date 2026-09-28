import type { AuthMe, AuthUserDirectory, Role } from '@vente-web/shared';
import { vi } from 'vitest';

export interface FakeResponse {
  status: number;
  body?: unknown;
}
/** `network` makes fetch reject, as when the shop server is unreachable. */
type Handler = FakeResponse | 'network' | ((body: unknown) => FakeResponse | Promise<FakeResponse>);

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

/** Stubs `fetch` with handlers keyed `METHOD /path` (without the `/api/v1` prefix). */
export function fakeApi(initial: Record<string, Handler>) {
  const handlers = new Map(Object.entries(initial));
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = input.replace(/^\/api\/v1/, '');
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const headers = { ...(init?.headers as Record<string, string> | undefined) };
    calls.push({ method, path, body, headers });
    const handler = handlers.get(`${method} ${path}`) ?? apiError(404, 'NOT_FOUND');
    if (handler === 'network') throw new TypeError('Failed to fetch');
    const response = typeof handler === 'function' ? await handler(body) : handler;
    return new Response(response.status === 204 ? null : JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    on(key: string, handler: Handler) {
      handlers.set(key, handler);
    },
    callsTo(key: string) {
      return calls.filter((call) => `${call.method} ${call.path}` === key);
    },
  };
}

export function apiError(status: number, code: string, details?: unknown): FakeResponse {
  return { status, body: { code, message: code, ...(details === undefined ? {} : { details }) } };
}

export const ok = (body: unknown): FakeResponse => ({ status: 200, body });

export const RIJA = {
  id: '0192a4f0-0000-7000-8000-000000000001',
  username: 'rija',
  fullName: 'Rija Rakoto',
  roles: ['sales'],
} satisfies AuthUserDirectory['users'][number];

export const HERY = {
  id: '0192a4f0-0000-7000-8000-000000000002',
  username: 'hery',
  fullName: 'Hery Rabe',
  roles: ['manager', 'cashier'],
} satisfies AuthUserDirectory['users'][number];

export const DIRECTORY: AuthUserDirectory = { users: [HERY, RIJA] };

interface MeOptions {
  user: { id: string; username: string; fullName: string; roles: Role[] };
  activeRole: Role;
  authMethod?: AuthMe['session']['authMethod'];
  origin?: AuthMe['session']['origin'];
  idleMinutes?: number;
}

export function meFor({
  user,
  activeRole,
  authMethod = 'PIN',
  origin = 'LAN',
  idleMinutes = 5,
}: MeOptions): AuthMe {
  return {
    user: { ...user, totpEnabled: false },
    session: {
      activeRole,
      origin,
      authMethod,
      stationId: null,
      expiresAt: '2026-09-25T20:00:00.000Z',
      idleMinutes,
    },
  };
}
