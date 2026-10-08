import {
  computeQuote,
  grantsFor,
  type DiscountEntry,
  type Order,
  type OrderDiscounts,
  type QuoteBeyondCap,
  type QuoteInput,
  type QuoteTotals,
} from '@vente-web/shared';

import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import { by, type Actor } from './actor.js';
import { recordAudit } from './audit.js';
import { suggestedOn } from './discount-rules.js';
import {
  amount,
  atMyRegister,
  snapshot,
  typedOrderDiscount,
  withinHeadroom,
} from './order-changes.js';
import {
  findOrder,
  grantsOf,
  pendingRequest,
  toOrder,
  usedCode,
  type StoredOrder,
} from './order-view.js';
import { assertNotFree, orderAmounts } from './quotes.js';

/**
 * Totals with the discounts the cashier typed (H61), on the prices and caps frozen at validation
 * (RG-CMD-04): a line changed takes its new discount, the others keep theirs to the cent; a line
 * the owner granted is bounded by the grant (RG-REM-04). The total takes the discount typed when
 * one is given, bounded by the headroom; left as it was, it is brought down to the headroom the
 * new line discounts leave (H23). A line's suggested discount widens its limit (H62). Beyond, the
 * change is refused: the owner decides (RG-REM-03).
 */
function discounted(order: StoredOrder, input: OrderDiscounts, suggested: (string | null)[]) {
  const changed = new Map(input.lines.map((line) => [line.position, line.discount]));
  for (const position of changed.keys()) {
    if (!order.lines.some((line) => line.position === position)) {
      throw new AppError(409, 'ORDER_CHANGED');
    }
  }
  const granted = grantsFor(
    grantsOf(usedCode(order)),
    order.lines.map((line) => ({
      productId: line.productId,
      quantity: line.qty.toFixed(),
      unitPrice: line.unitPrice.toFixed(2),
    })),
  );
  const quote = (orderDiscount: DiscountEntry | null): QuoteInput => ({
    lines: order.lines.map((line, index) => ({
      quantity: line.qty.toFixed(),
      unitPrice: line.unitPrice.toFixed(2),
      capPct: line.maxDiscountPct.toFixed(),
      granted: granted.lines[index] ?? null,
      suggestedPct: suggested[index] ?? null,
      discount: changed.has(line.position)
        ? (changed.get(line.position) ?? null)
        : amount(line.discountAmount.toFixed(2)),
    })),
    orderDiscount,
    orderGranted: granted.order,
  });
  const totals: QuoteTotals =
    input.orderDiscount === undefined
      ? withinHeadroom(quote, typedOrderDiscount(order))
      : computeQuote(quote(input.orderDiscount));
  if (!totals.withinLimits) {
    throw new AppError(422, 'QUOTE_DISCOUNT_BEYOND_CAP', {
      lines: totals.lines.flatMap((line, index) =>
        line.withinLimit ? [] : [order.lines[index]?.position ?? index + 1],
      ),
      order: !totals.orderWithinLimit,
    } satisfies QuoteBeyondCap);
  }
  return { changed, totals };
}

/**
 * Discounts applied at the register before payment, without the owner (H61, RG-REM-02/06): by the
 * cashier who called the order, or the manager, on its lines and its total, in % or in MGA, within
 * the caps or the suggested discounts (H62) — or what the owner granted. Articles and quantities stay: the order keeps its number,
 * its reservation and its ticket (H69). No reason asked; audited before → after (RG-AUD-01).
 */
export async function discountOrder(
  db: Db,
  actor: Actor,
  id: string,
  input: OrderDiscounts,
): Promise<Order> {
  const order = await atMyRegister(db, actor, id, input.version);
  // The owner's answer would land on discounts changed meanwhile (RG-REM-05).
  if (pendingRequest(order)) throw new AppError(409, 'DISCOUNT_REQUEST_PENDING');
  const { changed, totals } = discounted(order, input, await suggestedOn(db, order));
  assertNotFree(totals);
  const codeId = usedCode(order)?.id ?? null;

  return db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, status: 'AT_REGISTER', version: input.version },
      data: { ...orderAmounts(totals, codeId), version: { increment: 1 } },
    });
    if (count === 0) throw new AppError(409, 'ORDER_CHANGED');
    for (const [index, line] of order.lines.entries()) {
      const computed = totals.lines[index];
      if (!computed) continue;
      await tx.orderLine.update({
        where: { id: line.id },
        data: {
          ...(changed.has(line.position)
            ? {
                discountPct: computed.discountPct,
                discountAmount: computed.discount,
                discountSource: computed.source,
                discountCodeId: computed.source === 'CODE' ? codeId : null,
                lineTotal: computed.net,
              }
            : {}),
          orderDiscountShare: computed.orderDiscountShare,
        },
      });
    }
    const after = await findOrder(tx, id);
    if (!after) throw new AppError(404, 'NOT_FOUND');
    const result = toOrder(after);
    await recordAudit(tx, {
      ...by(actor),
      action: 'order.discounted',
      entityType: 'order',
      entityId: id,
      before: snapshot(toOrder(order)),
      after: snapshot(result),
    });
    return result;
  });
}
