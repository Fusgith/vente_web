import {
  formatMga,
  formatQty,
  type DiscountEntry,
  type Order,
  type PushMessage,
} from '@vente-web/shared';

/** The owner's notification in French, as the screens (ADR-0004); amounts as RG-FMT-01. */
export const PUSH_TEXT = {
  title: (customer: string) => `Demande de remise : ${customer}`,
  /** Each line says it is a discount asked: the order's own total comes after. */
  on: (what: string) => `Remise sur ${what}`,
  total: 'le total',
  more: (count: number) => `et ${count} autre${count > 1 ? 's' : ''}`,
  order: (total: string) => `Commande de ${total}`,
  reason: (reason: string) => `Motif : ${reason}`,
  askedBy: (name: string) => `Demandée par ${name}`,
  test: {
    title: 'Notifications activées',
    body: 'Les demandes de remise arriveront ici, même application fermée.',
  },
} as const;

/** A tap opens the owner's dashboard, where the request waits (RG-DSH-05). */
const HOME = '/';
/** The elements shown one per line; the rest are counted, the screen lists them all. */
const SHOWN_ITEMS = 3;
/** Well within the 4 kB a push service carries, encryption included (RFC 8291). */
const MAX_BODY = 1000;

const entryText = ({ kind, value }: DiscountEntry) =>
  kind === 'pct' ? `${formatQty(value)} %` : formatMga(value);

/**
 * What the owner reads on the phone for a request (RG-REM-03: the customer and the order): what
 * is asked, element by element, the order's total, the reason and who asks. The note stays on
 * the screen. One notification per request (its tag).
 */
export function requestMessage(order: Order): PushMessage | null {
  const request = order.discountRequest;
  if (!request) return null;
  const items = request.items.map((item) => {
    const name = item.product ? `${item.product.sku} ${item.product.name}` : PUSH_TEXT.total;
    return `${PUSH_TEXT.on(name)} : ${entryText(item.requested)}`;
  });
  const shown = items.slice(0, SHOWN_ITEMS);
  if (items.length > SHOWN_ITEMS) shown.push(PUSH_TEXT.more(items.length - SHOWN_ITEMS));
  const body = [
    ...shown,
    PUSH_TEXT.order(formatMga(order.total)),
    PUSH_TEXT.reason(request.reason),
    PUSH_TEXT.askedBy(request.requestedBy.fullName),
  ].join('\n');
  return {
    title: PUSH_TEXT.title(order.customer.name),
    body: body.length > MAX_BODY ? `${body.slice(0, MAX_BODY - 1)}…` : body,
    tag: `discount-request:${request.id}`,
    url: HOME,
  };
}

export const testMessage = (): PushMessage => ({ ...PUSH_TEXT.test, tag: 'push-test', url: HOME });
