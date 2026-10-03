import {
  discountAmount,
  grantOn,
  grantsFor,
  lineGross,
  type DiscountEntry,
  type Quote,
  type QuoteCode,
} from '@vente-web/shared';

import type { DraftLine, DraftState } from './draft.js';

/** The owner's code on the quote screen (T-034b, RG-REM-04, H41, H42): what it grants each line. */

export const amountOf = (value: string): DiscountEntry | null =>
  /[1-9]/.test(value) ? { kind: 'amount', value } : null;

export const sameDiscount = (a: DiscountEntry | null, b: DiscountEntry | null) =>
  a?.kind === b?.kind && a?.value === b?.value;

/** The discount a grant gives a line: an amount brought down to its gross, none once nothing. */
export function grantedDiscount(
  grant: DiscountEntry,
  qty: string,
  price: string,
): DiscountEntry | null {
  const discount = grantOn(grant, lineGross(qty, price));
  return discount.kind === 'amount' ? amountOf(discount.value) : discount;
}

/** A line still at what the code grants it: its discount follows its share (H41). */
export const followsGrant = (line: DraftLine) =>
  !!line.granted &&
  sameDiscount(line.discount, grantedDiscount(line.granted, line.qty, line.unit.price));

/**
 * The total the code does not cover kept its discount — unless the grants beyond the caps left it
 * less headroom and the API brought it down to that headroom, as an amount (H42).
 */
export function orderBroughtDown(draft: DraftState, quote: Quote): boolean {
  const covered = quote.discountCode?.items.some((item) => item.productId === null) ?? false;
  return (
    !covered &&
    !!draft.orderDiscount &&
    discountAmount(draft.orderDiscount, quote.subtotal) !== quote.orderDiscount
  );
}

/**
 * The quote with the owner's code, as the API applied it (H42): each line of a product the code
 * covers takes its grant — a rate as granted, an amount as the API split it and brought it down
 * to the line's gross — and the total too if covered; the other lines keep their discount.
 */
export function applyCode(state: DraftState, quote: Quote): DraftState {
  const code = quote.discountCode;
  if (!code) return state;
  const grants = new Map(code.items.map((item) => [item.productId, item.discount]));
  const stored = new Map(quote.lines.map((line) => [line.productUnitId, line]));
  const lines = state.lines.map((line) => {
    const grant = grants.get(line.product.id);
    const saved = stored.get(line.unit.id);
    if (!grant || !saved) return line;
    return { ...line, discount: grant.kind === 'pct' ? grant : amountOf(saved.discountAmount) };
  });
  const orderGrant = grants.get(null);
  const orderDiscount = orderGrant
    ? orderGrant.kind === 'pct'
      ? orderGrant
      : amountOf(quote.orderDiscount)
    : orderBroughtDown(state, quote)
      ? amountOf(quote.orderDiscount)
      : state.orderDiscount;
  return { ...state, lines, orderDiscount, code };
}

/**
 * The code the owner's answer brought (H53) on a quote changed meanwhile and not saved: the API
 * applied it to the saved quote, so a total discount typed since is kept as typed — unless the
 * code covers the total — and checked again with the code at the next save.
 */
export function applyCodeOnTyped(state: DraftState, quote: Quote, sentTotal: DiscountEntry | null) {
  const next = applyCode(state, quote);
  const covered = quote.discountCode?.items.some((item) => item.productId === null) ?? false;
  return covered || sameDiscount(state.orderDiscount, sentTotal)
    ? next
    : { ...next, orderDiscount: state.orderDiscount };
}

function lineGrants(code: QuoteCode | null | undefined, lines: readonly DraftLine[]) {
  return grantsFor(
    code?.items ?? [],
    lines.map((line) => ({
      productId: line.product.id,
      quantity: line.qty,
      unitPrice: line.unit.price,
    })),
  );
}

/**
 * What the code would grant a line at another quantity, the other lines as they are: the pad's
 * maximum while the quantity is typed (H41).
 */
export function grantedAt(draft: DraftState, key: string, qty: string): DiscountEntry | null {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (!draft.code || index < 0) return null;
  const lines = draft.lines.map((line) => (line.key === key ? { ...line, qty } : line));
  return lineGrants(draft.code, lines).lines[index] ?? null;
}

/**
 * What the owner's code grants each line and the total, laid as the API lays it (H41): an amount
 * on a product sold in several units is split pro rata of their gross. A line still at its share
 * follows it as the lines change, and a new line of a covered product starts with it: the screen
 * never keeps a share the quantities no longer give.
 */
export function withGrants(prev: DraftState, next: DraftState): DraftState {
  const granted = lineGrants(next.code, next.lines);
  const before = new Map(prev.lines.map((line) => [line.key, line]));
  const lines = next.lines.map((line, index) => {
    const grant = granted.lines[index] ?? null;
    const was = before.get(line.key);
    const follows = was
      ? followsGrant(was) && sameDiscount(line.discount, was.discount)
      : line.discount === null;
    const discount =
      grant && follows ? grantedDiscount(grant, line.qty, line.unit.price) : line.discount;
    return { ...line, granted: grant, discount };
  });
  return { ...next, lines, orderGranted: granted.order };
}
