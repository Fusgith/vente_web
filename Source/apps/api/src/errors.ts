import { ERROR_LABELS, type ApiErrorBody, type ErrorCode } from '@vente-web/shared';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/**
 * Error carrying an HTTP status and a stable code; the handler below turns it into the
 * `{ code, message, details }` body of CDC technique §6. The message comes from the shared
 * labels, so no French string is needed where the error is thrown (ADR-0004).
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export function errorBody(code: ErrorCode, details?: unknown): ApiErrorBody {
  return details === undefined
    ? { code, message: ERROR_LABELS[code] }
    : { code, message: ERROR_LABELS[code], details };
}

/** Fastify-generated errors (body parsing, unsupported media type…) carry `statusCode`. */
function fastifyStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => reply.code(404).send(errorBody('NOT_FOUND')));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.status).send(errorBody(error.code, error.details));
    }
    if (error instanceof ZodError) {
      // Paths and messages only: the rejected input (a password, a code) is never echoed.
      const issues = error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      }));
      return reply.code(400).send(errorBody('VALIDATION_ERROR', { issues }));
    }
    const status = fastifyStatus(error);
    if (status === 429) return reply.code(429).send(errorBody('RATE_LIMITED'));
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.code(status).send(errorBody('BAD_REQUEST'));
    }
    request.log.error(error);
    return reply.code(500).send(errorBody('INTERNAL_ERROR'));
  });
}
