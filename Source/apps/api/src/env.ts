import { ACCESS_ORIGINS, DEFAULT_APP_NAME, appNameProblem, tidyAppName } from '@vente-web/shared';
import { z } from 'zod';

import { parseTrustedProxies } from './services/trusted-proxy.js';
import { vapidOf, vapidProblems } from './services/vapid.js';

/** `VAR=` in a `.env` file means "not set", not "set to the empty string". */
const blankAsUnset = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Process environment, validated once at startup (values documented in Source/.env.example). */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Name of this build, shown as the issuer in the authenticator app (RG-APP-01, ADR-0006). */
    APP_NAME: z.preprocess(
      blankAsUnset,
      z.string().default(DEFAULT_APP_NAME).transform(tidyAppName),
    ),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** PostgreSQL connection string; the shop server is the single master database (ADR-0001). */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Where issued documents are kept (`invoices/<year>/<number>.pdf`, RG-FAC-04): the `files` volume. */
    FILES_DIR: z.string().min(1).default('files'),
    /** Absolute lifetime of a session: at most the 12 h of H19, shorter allowed. */
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
    /**
     * Push notifications to the owner (T-033e, RG-DSH-05): the VAPID key pair and contact, all
     * three or none — none turns push off (development, tests, a shop without it).
     */
    VAPID_PUBLIC_KEY: z.preprocess(blankAsUnset, z.string().trim().optional()),
    VAPID_PRIVATE_KEY: z.preprocess(blankAsUnset, z.string().trim().optional()),
    VAPID_SUBJECT: z.preprocess(blankAsUnset, z.string().trim().optional()),
  })
  .check((ctx) => {
    const appNameIssue = appNameProblem(ctx.value.APP_NAME);
    if (appNameIssue) {
      ctx.issues.push({
        code: 'custom',
        path: ['APP_NAME'],
        message: appNameIssue,
        input: ctx.value.APP_NAME,
      });
    }
    if (ctx.value.NODE_ENV === 'production' && ctx.value.AUTH_DEFAULT_ORIGIN !== undefined) {
      ctx.issues.push({
        code: 'custom',
        path: ['AUTH_DEFAULT_ORIGIN'],
        message: 'must not be set in production: a missing origin header means REMOTE',
        input: ctx.value.AUTH_DEFAULT_ORIGIN,
      });
    }
    for (const { variable, message } of vapidProblems(ctx.value)) {
      // The value is never echoed: the private key is a secret.
      ctx.issues.push({ code: 'custom', path: [variable], message, input: undefined });
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
    VAPID: vapidOf(env),
  }));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
