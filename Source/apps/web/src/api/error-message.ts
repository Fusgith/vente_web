import { ERROR_LABELS } from '@vente-web/shared';

import { labels } from '../labels.js';
import { ApiError } from './client.js';

function retryAfterSeconds(details: unknown): number | null {
  if (typeof details !== 'object' || details === null || !('retryAfterSeconds' in details)) {
    return null;
  }
  const seconds = details.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? seconds : null;
}

/** The French message to show for a failed call; the code decides, never the server's text. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return labels.errors.UNEXPECTED_RESPONSE;
  switch (error.code) {
    case 'NETWORK_ERROR':
    case 'UNEXPECTED_RESPONSE':
      return labels.errors[error.code];
    case 'AUTH_LOCKED': {
      // RG-USR-05: the shop may tell how long the lock lasts (only sent on the LAN).
      const seconds = retryAfterSeconds(error.details);
      return seconds === null
        ? ERROR_LABELS.AUTH_LOCKED
        : labels.errors.lockedFor(Math.ceil(seconds / 60));
    }
    default:
      return ERROR_LABELS[error.code];
  }
}
