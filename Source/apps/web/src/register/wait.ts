import type { QueueItem } from '@vente-web/shared';

import { labels } from '../labels.js';

/**
 * How long an order has waited since it entered the queue, as shown (RG-FIL-05): validated for
 * the register, paid for the delivery.
 */
export function waitOf(item: Pick<QueueItem, 'submittedAt' | 'paidAt'>, now: number): string {
  const since = item.paidAt ?? item.submittedAt;
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
  return labels.register.minutes(minutes);
}
