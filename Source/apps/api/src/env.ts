import { ACCESS_ORIGINS } from '@vente-web/shared';
import { z } from 'zod';

import { parseTrustedProxies } from './services/trusted-proxy.js';

/** `VAR=` in a `.env` file means "not set", not "set to the empty string". */
const blankAsUnset = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Process environment, validated once at startup (values documented in Source/.env.example). */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** PostgreSQL connection string; the shop server is the single master database (ADR-0001). */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Absolute lifetime of a session: at most the 12 h of H19 (⚠️), shorter allowed. */
    AUTH_SESSION_HOURS: z.coerce.number().int().min(1).max(12).default(12),
    /**
     * Origin assumed when the `x-access-origin` header is absent: LAN outside production (a dev
     * server or a test is the shop), never set in production, where a missing header means
     * REMOTE (fail-closed, CDC technique §2.2).
     */
    AUTH_DEFAULT_ORIGIN: z.preprocess(blankAsUnset, z.enum(ACCESS_ORIGINS).optional()),
    /** `Secure` cookie flag; true in production, where false is refused (HTTPS, §8). */
    COOKIE_SECURE: z.preprocess(blankAsUnset, z.stringbool().optional()),
    /** Peers allowed to set `x-access-origin` and `X-Forwarded-For`: the reverse proxy. */
    TRUST_PROXY: z.preprocess(
      blankAsUnset,
      z
        .string()
        .default('127.0.0.1,::1')
        .transform((spec, ctx) => {
          try {
            return parseTrustedProxies(spec);
          } catch (error) {
            ctx.addIssue({ code: 'custom', message: (error as Error).message });
            return z.NEVER;
          }
        }),
    ),
  })
  .check((ctx) => {
    if (ctx.value.NODE_ENV === 'production' && ctx.value.AUTH_DEFAULT_ORIGIN !== undefined) {
      ctx.issues.push({
        code: 'custom',
        path: ['AUTH_DEFAULT_ORIGIN'],
        message: 'must not be set in production: a missing origin header means REMOTE',
        input: ctx.value.AUTH_DEFAULT_ORIGIN,
      });
    }
    if (ctx.value.NODE_ENV === 'production' && ctx.value.COOKIE_SECURE === false) {
      ctx.issues.push({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must not be false in production: HTTPS is mandatory (CDC technique §8)',
        input: ctx.value.COOKIE_SECURE,
      });
    }
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    AUTH_DEFAULT_ORIGIN:
      env.NODE_ENV === 'production' ? undefined : (env.AUTH_DEFAULT_ORIGIN ?? 'LAN'),
  }));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
