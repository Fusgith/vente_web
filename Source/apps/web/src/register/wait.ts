import type { QueueItem } from '@vente-web/shared';

import { labels } from '../labels.js';

/** How long an order has waited since it entered the queue, as shown (RG-FIL-05). */
export function waitOf(item: Pick<QueueItem, 'submittedAt'>, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(item.submittedAt)) / 60_000));
  return labels.register.minutes(minutes);
}
