import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyHttpOptions,
  type FastifyInstance,
  type RawServerDefault,
} from 'fastify';

import { createDb, type Db } from './db.js';
import type { Env } from './env.js';
import { AppError, registerErrorHandler } from './errors.js';
import { accessOriginPlugin } from './plugins/access-origin.js';
import { csrfPlugin } from './plugins/csrf.js';
import { dbPlugin } from './plugins/db.js';
import { sessionPlugin } from './plugins/session.js';
import { healthRoutes } from './routes/health.js';
import { apiRoutes } from './routes/index.js';

type ServerOptions = FastifyHttpOptions<RawServerDefault, FastifyBaseLogger>;
type LoggerOptions = NonNullable<ServerOptions['logger']>;

export interface BuildAppOptions {
  env: Env;
  /** Prisma client to use (tests); the app creates and owns one from `env` otherwise. */
  db?: Db;
  /** Override Fastify options (tests pass `logger: false`). */
  fastify?: ServerOptions;
}

function loggerOptions(env: Env): LoggerOptions {
  const base = {
    level: env.LOG_LEVEL,
    // Session cookies and credentials never reach the logs (CDC technique section 8).
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  };
  if (env.NODE_ENV === 'development') {
    // Human-readable logs on the dev machine; JSON (pino) everywhere else.
    return { ...base, transport: { target: 'pino-pretty' } };
  }
  return base;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { env } = options;
  const app = Fastify({
    logger: loggerOptions(env),
    // `request.ip` follows X-Forwarded-For only from the reverse proxy (CDC technique section 2.2).
    trustProxy: [...env.TRUST_PROXY.entries],
    ...options.fastify,
  });
  registerErrorHandler(app);

  await app.register(cookie);
  await app.register(accessOriginPlugin, { env });
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => `${request.accessOrigin}:${request.ip}`,
    errorResponseBuilder: (_request, context) =>
      new AppError(429, 'RATE_LIMITED', { retryAfterSeconds: Math.ceil(context.ttl / 1000) }),
  });
  await app.register(dbPlugin, {
    db: options.db ?? createDb(env.DATABASE_URL),
    ownsClient: options.db === undefined,
  });
  await app.register(csrfPlugin);
  await app.register(sessionPlugin, { env });

  await app.register(healthRoutes);
  await app.register(apiRoutes, { env, prefix: '/api/v1' });
  return app;
}
