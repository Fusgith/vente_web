import { isErrorCode, type ErrorCode } from '@vente-web/shared';

/** Failures seen only by the client, next to the API's own codes (labels in `labels.ts`). */
export type ClientErrorCode = 'NETWORK_ERROR' | 'UNEXPECTED_RESPONSE';

/** An API error body `{ code, message, details }` (CDC technique §6), or a client failure. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | ClientErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const API_BASE = '/api/v1';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Extra headers, e.g. `idempotency-key` on a payment. */
  headers?: Record<string, string>;
}

/**
 * Same-origin JSON request: the session cookie goes along and the browser's `Sec-Fetch-Site`
 * satisfies the API's CSRF check. Resolves with the parsed body (undefined for 204).
 */
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers,
  };
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  if (response.status === 204) return undefined;

  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const body = typeof payload === 'object' && payload !== null ? payload : {};
    const code = 'code' in body && isErrorCode(body.code) ? body.code : 'UNEXPECTED_RESPONSE';
    throw new ApiError(response.status, code, 'details' in body ? body.details : undefined);
  }
  return payload;
}

type SafeParse<T> = { success: true; data: T } | { success: false };

/** Parses a response with the shared schema; a mismatch is the server's fault, not the user's. */
export function parseResponse<T>(
  schema: { safeParse(data: unknown): SafeParse<T> },
  data: unknown,
): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new ApiError(200, 'UNEXPECTED_RESPONSE');
  return result.data;
}
