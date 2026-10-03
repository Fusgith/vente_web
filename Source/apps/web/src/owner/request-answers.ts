import {
  formatMga,
  formatQty,
  type DiscountEntry,
  type DiscountRequestGrant,
  type DiscountRequestItem,
} from '@vente-web/shared';

import { labels } from '../labels.js';
import { entryOf, grantOf, isGrant, type Grant } from '../ui/grant.js';

const text = labels.requests.board;

/** The owner's answer on one element of a request (H53): as asked, another value, or nothing. */
export type Answer = { choice: 'asked' } | { choice: 'other'; grant: Grant } | { choice: 'none' };

export const ANSWERS = ['asked', 'other', 'none'] as const;

/** By default, each element as asked: the owner changes only what is not granted as is. */
export const askedAnswers = (items: readonly DiscountRequestItem[]): Record<string, Answer> =>
  Object.fromEntries(items.map((item) => [item.id, { choice: 'asked' }]));

/** The answer chosen, another value starting from the one asked. */
export function answerOf(item: DiscountRequestItem, choice: Answer['choice']): Answer {
  return choice === 'other' ? { choice, grant: grantOf(item.requested) } : { choice };
}

/** « 12 % » or « 5 000,00 MGA »: rates and amounts share the column, each says its unit. */
export const entryText = ({ kind, value }: DiscountEntry) =>
  kind === 'pct' ? `${formatQty(value)} %` : formatMga(value);

/** The element's name: the product's code and name, or the order total. */
export const itemName = (item: DiscountRequestItem) =>
  item.product ? `${item.product.sku} ${item.product.name}` : labels.requests.total;

/**
 * What the owner grants, element by element (H53); else why it cannot be sent: nothing granted
 * (that is a refusal), or another value that is not one.
 */
export function grantItems(
  items: readonly DiscountRequestItem[],
  answers: Record<string, Answer>,
): DiscountRequestGrant['items'] | string {
  const granted = items.map((item) => {
    const answer = answers[item.id] ?? { choice: 'asked' };
    if (answer.choice === 'none') return { itemId: item.id, discount: null };
    if (answer.choice === 'asked') return { itemId: item.id, discount: item.requested };
    return { itemId: item.id, discount: isGrant(answer.grant) ? entryOf(answer.grant) : undefined };
  });
  if (granted.some((item) => item.discount === undefined)) return text.otherInvalid;
  if (granted.every((item) => item.discount === null)) return text.nothingGranted;
  return granted as DiscountRequestGrant['items'];
}
