import { authMeSchema, ERROR_LABELS } from '@vente-web/shared';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { apiError, fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { ApiError, apiRequest, parseResponse } from './client.js';
import { errorMessage } from './error-message.js';

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => undefined,
    (failure: unknown) => failure,
  );
  if (!(error instanceof ApiError)) throw new Error('expected an ApiError');
  return error;
}

describe('apiRequest', () => {
  it('sends JSON to the versioned API with the session cookie', async () => {
    const api = fakeApi({ 'POST /auth/switch-role': ok({ done: true }) });

    await expect(
      apiRequest('/auth/switch-role', { method: 'POST', body: { role: 'cashier' } }),
    ).resolves.toEqual({ done: true });
    expect(api.calls).toEqual([
      {
        method: 'POST',
        path: '/auth/switch-role',
        body: { role: 'cashier' },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
      },
    ]);
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]?.[1];
    expect(init?.credentials).toBe('same-origin');
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('resolves 204 with nothing', async () => {
    fakeApi({ 'POST /auth/logout': { status: 204 } });
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('keeps the error code and details of the body', async () => {
    fakeApi({ 'POST /auth/login': apiError(423, 'AUTH_LOCKED', { retryAfterSeconds: 60 }) });
    const error = await failureOf(apiRequest('/auth/login', { method: 'POST', body: {} }));
    expect(error).toMatchObject({
      status: 423,
      code: 'AUTH_LOCKED',
      details: { retryAfterSeconds: 60 },
    });
  });

  it('never trusts an unknown code', async () => {
    fakeApi({ 'GET /auth/me': apiError(500, 'SOMETHING_NEW') });
    const error = await failureOf(apiRequest('/auth/me'));
    expect(error).toMatchObject({ status: 500, code: 'UNEXPECTED_RESPONSE' });
  });

  it('tells a network failure apart', async () => {
    fakeApi({ 'GET /auth/me': 'network' });
    const error = await failureOf(apiRequest('/auth/me'));
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});

describe('parseResponse', () => {
  it('returns the data matching the shared schema', () => {
    const me = meFor({ user: RIJA, activeRole: 'sales' });
    expect(parseResponse(authMeSchema, me)).toEqual(me);
  });

  it('blames the server for a body that does not match', () => {
    expect(() => parseResponse(authMeSchema, { user: null })).toThrow(ApiError);
  });
});

describe('errorMessage', () => {
  it('speaks French for every failure, never the server text', () => {
    expect(errorMessage(new ApiError(0, 'NETWORK_ERROR'))).toBe(labels.errors.NETWORK_ERROR);
    expect(errorMessage(new ApiError(401, 'AUTH_INVALID_CREDENTIALS'))).toBe(
      ERROR_LABELS.AUTH_INVALID_CREDENTIALS,
    );
    expect(errorMessage(new Error('boom'))).toBe(labels.errors.UNEXPECTED_RESPONSE);
  });

  it('rounds the lock duration up to the minute (RG-USR-05)', () => {
    const locked = (details?: unknown) => errorMessage(new ApiError(423, 'AUTH_LOCKED', details));
    expect(locked({ retryAfterSeconds: 61 })).toBe(labels.errors.lockedFor(2));
    expect(locked({ retryAfterSeconds: 900 })).toBe(labels.errors.lockedFor(15));
    // Remote failures do not tell how long (T-012).
    expect(locked()).toBe(ERROR_LABELS.AUTH_LOCKED);
  });
});
