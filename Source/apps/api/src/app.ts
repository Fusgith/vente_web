import Fastify, {
  type FastifyBaseLogger,
  type FastifyHttpOptions,
  type FastifyInstance,
  type RawServerDefault,
} from 'fastify';

import type { Env } from './env.js';
import { healthRoutes } from './routes/health.js';

type ServerOptions = FastifyHttpOptions<RawServerDefault, FastifyBaseLogger>;
type LoggerOptions = NonNullable<ServerOptions['logger']>;

export interface BuildAppOptions {
  env: Env;
  /** Override Fastify options (tests pass `logger: false`). */
  fastify?: ServerOptions;
}

function loggerOptions(env: Env): LoggerOptions {
  if (env.NODE_ENV === 'development') {
    // Human-readable logs on the dev machine; JSON (pino) everywhere else.
    return { level: env.LOG_LEVEL, transport: { target: 'pino-pretty' } };
  }
  return { level: env.LOG_LEVEL };
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(options.env), ...options.fastify });
  await app.register(healthRoutes);
  return app;
}
