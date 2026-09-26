import type { IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';

import {
  REALTIME_PATH,
  type AccessOrigin,
  type ErrorCode,
  type RealtimeEvent,
  type RealtimeEvents,
  type Role,
} from '@vente-web/shared';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Server, type Socket } from 'socket.io';

import type { Env } from '../env.js';
import { ACCESS_ORIGIN_HEADER, resolveAccessOrigin } from '../services/access-origin.js';
import { roomsOf, type Emission } from '../services/realtime-rooms.js';
import { hashSessionToken, resolveSessionHash, sessionCookieName } from '../services/sessions.js';
import { isSameOrigin } from './csrf.js';

/** How often each open connection's session is checked again: at most this long after it ends. */
export const REVALIDATE_MS = 30_000;

/** What a connection keeps of its session: the token's hash, never the token (T5). */
interface SocketData {
  tokenHash: string;
  origin: AccessOrigin;
  userId: string;
  role: Role;
}

/** The server only speaks: the client sends nothing but its handshake. */
type ServerEvents = Record<RealtimeEvent, (payload: RealtimeEvents[RealtimeEvent]) => void>;

type RealtimeSocket = Socket<object, ServerEvents, object, SocketData>;

export interface Realtime {
  /** Sends events after the change they announce is committed. */
  publish(emissions: readonly Emission[]): void;
  /** Checks every open connection's session now (the timer does it every 30 s). */
  revalidate(): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Realtime;
  }
}

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined;

/**
 * Scheme and host the browser used, as Fastify reads them for HTTP: the reverse proxy's
 * `X-Forwarded-*` headers count only from a trusted peer (CDC technique §2.2).
 */
function siteOf(request: IncomingMessage, env: Env): { protocol: string; host: string } {
  const trusted = env.TRUST_PROXY.isTrusted(request.socket.remoteAddress);
  const encrypted = (request.socket as Partial<TLSSocket>).encrypted === true;
  return {
    protocol:
      (trusted ? first(request.headers['x-forwarded-proto']) : undefined) ??
      (encrypted ? 'https' : 'http'),
    host:
      (trusted ? first(request.headers['x-forwarded-host']) : undefined) ??
      request.headers.host ??
      '',
  };
}

/**
 * A page of another site must never open a connection with the shop's cookie (cross-site
 * WebSocket hijacking): the handshake needs our exact `Origin`, and a `Sec-Fetch-Site` other
 * than same-origin is believed over it, as for HTTP (CDC technique §8).
 */
export function isFirstParty(request: IncomingMessage, env: Env): boolean {
  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return false;
  const { protocol, host } = siteOf(request, env);
  return isSameOrigin(request.headers.origin, protocol, host);
}

function refusal(code: ErrorCode): Error {
  return Object.assign(new Error(code), { data: { code } });
}

/**
 * Socket.IO on the API's own HTTP server (CDC technique §6.1), WebSocket only: no polling
 * requests, hence nothing for the CSRF rule to guard beyond the handshake. A connection is the
 * session of its cookie, checked with the HTTP rules — lifetime, account, role, origin, idle —
 * without counting as activity; it joins the rooms of its role, user, station and queues, and
 * is dropped when its session ends or changes role.
 */
export const realtimePlugin = fp<{ env: Env; revalidateMs?: number }>(
  async (app, { env, revalidateMs = REVALIDATE_MS }) => {
    const io = new Server<object, ServerEvents, object, SocketData>(app.server, {
      path: REALTIME_PATH,
      serveClient: false,
      transports: ['websocket'],
      allowRequest: (request, callback) => callback(null, isFirstParty(request, env)),
    });
    const cookieName = sessionCookieName(env.COOKIE_SECURE);

    io.use((socket, next) => {
      void authenticate(app, env, socket, cookieName).then(
        (failure) => next(failure ? refusal(failure) : undefined),
        (error: unknown) => {
          app.log.error(error);
          next(refusal('INTERNAL_ERROR'));
        },
      );
    });

    let running = false;
    async function revalidate(): Promise<void> {
      if (running) return;
      running = true;
      try {
        for (const socket of await io.local.fetchSockets()) {
          const { tokenHash, origin, role } = socket.data;
          const result = await resolveSessionHash(app.db, tokenHash, origin, new Date(), {
            touch: false,
          });
          // A role switched in place joins other rooms: the client connects again.
          if (!result.auth || result.auth.session.activeRole !== role) socket.disconnect(true);
        }
      } finally {
        running = false;
      }
    }
    const timer = setInterval(() => {
      revalidate().catch((error: unknown) => app.log.error(error));
    }, revalidateMs);
    timer.unref();

    app.decorate('realtime', {
      publish(emissions) {
        for (const { rooms, event, payload } of emissions) io.to(rooms).emit(event, payload);
      },
      revalidate,
    } satisfies Realtime);

    // Open WebSockets would hold the HTTP server's close: drop them first.
    app.addHook('preClose', async () => {
      clearInterval(timer);
      io.local.disconnectSockets(true);
      io.engine.close();
    });
  },
  { name: 'realtime', dependencies: ['@fastify/cookie', 'db'] },
);

/** Checks the handshake's session and joins its rooms; the failure code, or null. */
async function authenticate(
  app: FastifyInstance,
  env: Env,
  socket: RealtimeSocket,
  cookieName: string,
): Promise<ErrorCode | null> {
  const request = socket.request;
  const token = app.parseCookie(request.headers.cookie ?? '')[cookieName];
  if (!token) return 'AUTH_REQUIRED';
  const origin = resolveAccessOrigin({
    header: request.headers[ACCESS_ORIGIN_HEADER],
    remoteAddress: request.socket.remoteAddress,
    trustedProxies: env.TRUST_PROXY,
    defaultOrigin: env.AUTH_DEFAULT_ORIGIN,
  });
  const tokenHash = hashSessionToken(token);
  const result = await resolveSessionHash(app.db, tokenHash, origin, new Date(), {
    touch: false,
  });
  if (!result.auth) return result.failure;
  const { user, session } = result.auth;
  socket.data = { tokenHash, origin, userId: user.id, role: session.activeRole };
  await socket.join(
    roomsOf({ userId: user.id, role: session.activeRole, stationId: session.stationId }),
  );
  return null;
}
