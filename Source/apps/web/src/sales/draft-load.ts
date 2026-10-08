import { discountAmount, type DiscountEntry, type Quote, type QuoteLine } from '@vente-web/shared';

import { catalogApi } from '../api/catalog.js';
import { quotesApi } from '../api/quotes.js';
import {
  draftReducer,
  emptyDraft,
  saveSignature,
  type DraftLine,
  type DraftState,
} from './draft.js';

/**
 * A saved quote back on the quote screen (T-035b, RG-DEV-02/03, H56): its lines, customer and
 * discounts as saved, each article read again from the catalogue for its units and its stock.
 */
export async function loadQuote(id: string): Promise<DraftState> {
  const quote = await quotesApi.get(id);
  const lines = await Promise.all(quote.lines.map(draftLine));
  const base: DraftState = {
    ...emptyDraft,
    lines,
    customer: quote.customer,
    orderDiscount: orderDiscountOf(quote),
  };
  return draftReducer(
    base,
    quote.discountCode
      ? { type: 'codeAttached', quote, sent: base }
      : { type: 'saved', quote, body: saveSignature(base) },
  );
}

const some = (value: string) => /[1-9]/.test(value);

/** The discount as typed: its rate when the rate gives the amount saved, else the amount. */
export function typedDiscount(
  pct: string | null,
  amount: string,
  base: string,
): DiscountEntry | null {
  if (!some(amount)) return null;
  const rate: DiscountEntry | null = pct && some(pct) ? { kind: 'pct', value: pct } : null;
  return rate && discountAmount(rate, base) === amount ? rate : { kind: 'amount', value: amount };
}

function orderDiscountOf(quote: Quote): DiscountEntry | null {
  return typedDiscount(quote.orderDiscountPct, quote.orderDiscount, quote.subtotal);
}

/** The line with its article as the catalogue has it now; an article gone keeps what was saved. */
async function draftLine(line: QuoteLine): Promise<DraftLine> {
  const found = await catalogApi.search(line.sku).catch(() => null);
  const hit = found?.items.find((item) => item.id === line.productId);
  const saved = {
    id: line.productUnitId,
    label: line.unitLabel,
    factor: line.factor,
    isBase: Number(line.factor) === 1,
    barcode: null,
    price: line.unitPrice,
    maxDiscountPct: line.capPct,
  };
  const unit = hit?.units.find((candidate) => candidate.id === line.productUnitId) ?? saved;
  return {
    key: `${line.productId}:${line.productUnitId}`,
    product: hit ?? {
      id: line.productId,
      sku: line.sku,
      name: line.name,
      baseUnit: line.baseUnit,
      available: '0',
      units: [saved],
    },
    unit: { ...unit, price: line.unitPrice },
    qty: line.qty,
    capPct: line.capPct,
    discount: typedDiscount(line.discountPct, line.discountAmount, line.gross),
  };
}
