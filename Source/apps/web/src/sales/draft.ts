import {
  addQuantities,
  type Customer,
  type DiscountEntry,
  type DiscountRequestSummary,
  type Order,
  type ProductHit,
  type ProductUnitHit,
  type Quote,
  type QuoteCode,
  type QuoteSave,
  type StockShortage,
} from '@vente-web/shared';

import { applyCode, applyCodeOnTyped, withGrants } from './draft-code.js';

export { followsGrant, grantedAt, grantedDiscount, orderBroughtDown } from './draft-code.js';

/**
 * Lines picked on the quote screen, kept in memory until the quote is saved (T-030).
 * One line per product × sale unit (RG-DEV-05): adding the same pair again adds to its quantity,
 * which is how a second scan of the same article counts +1 (RG-DEV-06 §3).
 */
export interface DraftLine {
  key: string;
  /** `available`: the stock when the line was added, shown per unit on the quantity pad. */
  product: Pick<ProductHit, 'id' | 'sku' | 'name' | 'baseUnit' | 'available' | 'units'>;
  unit: ProductUnitHit & { price: string };
  qty: string;
  /** Cap of the unit in %, resolved by the API (RG-REM-01); the API checks it again on saving. */
  capPct: string;
  discount: DiscountEntry | null;
  /** Discount granted by the owner’s code (RG-REM-04), in place of the cap. */
  granted?: DiscountEntry | null;
}

export type DraftCustomer = Pick<Customer, 'id' | 'name' | 'phone'>;

/** The quote as last saved: its number, the version to send back, and what was sent. */
export interface SavedQuote {
  id: string;
  number: string;
  version: number;
  /** The body sent, to tell whether the screen still matches the saved quote. */
  body: string;
}

export interface DraftState {
  lines: DraftLine[];
  /** The line whose quantity pad is open: the last one added, or the one tapped. */
  selected: string | null;
  /** Mandatory before the quote is saved (RG-DEV-04); chosen from the directory (T-029). */
  customer: DraftCustomer | null;
  orderDiscount: DiscountEntry | null;
  orderGranted?: DiscountEntry | null;
  saved?: SavedQuote | null;
  /**
   * The owner's code attached to the saved quote (RG-REM-04, H42): one per quote, for good; what it
   * grants replaces the caps of the lines and of the total it covers.
   */
  code?: QuoteCode | null;
  /**
   * The latest request to the owner on the saved quote (T-033b, H51 to H54): while it waits, the
   * customer stays and no code is typed (H52); granted, its code is attached (H53).
   */
  request?: DiscountRequestSummary | null;
  /** Products short of stock when validation was refused (RG-CMD-02), until their lines change. */
  shortages?: StockShortage[];
  /** The sheet of those shortages, open when they arrive. */
  shortagesOpen?: boolean;
  /** The order once validated (T-032): its ticket shows until a new quote starts. */
  order?: Order | null;
}

export type DraftAction =
  | { type: 'add'; hit: ProductHit; unitId: string; qty: string | null }
  | { type: 'setQty'; key: string; qty: string }
  | { type: 'setUnit'; key: string; unitId: string }
  | { type: 'remove'; key: string }
  | { type: 'select'; key: string | null }
  | { type: 'setDiscount'; key: string; discount: DiscountEntry | null }
  | { type: 'setOrderDiscount'; discount: DiscountEntry | null }
  | { type: 'setCustomer'; customer: DraftCustomer | null }
  /** `body`: the `saveSignature` of what was sent, lines typed meanwhile staying unsaved. */
  | { type: 'saved'; quote: Quote; body: string }
  /**
   * The quote as the API returned it with the owner's code attached (T-034b); `sent`: the screen
   * as it was sent, lines typed meanwhile staying unsaved.
   */
  | { type: 'codeAttached'; quote: Quote; sent: DraftState }
  /** The saved quote read again once its request was made, withdrawn or decided (T-033b). */
  | { type: 'requestChanged'; quote: Quote }
  | { type: 'short'; shortages: StockShortage[] }
  | { type: 'closeShortages' }
  | { type: 'submitted'; order: Order }
  /** A new quote, empty, once the ticket was given. */
  | { type: 'reset' }
  /** A saved quote taken up again from the salesperson's list (T-035b), as `loadQuote` built it. */
  | { type: 'load'; draft: DraftState };

export const emptyDraft: DraftState = {
  lines: [],
  selected: null,
  customer: null,
  orderDiscount: null,
};

const keyOf = (productId: string, unitId: string) => `${productId}:${unitId}`;

function sellableUnit(product: DraftLine['product'], unitId: string): DraftLine['unit'] | null {
  const unit = product.units.find((candidate) => candidate.id === unitId);
  return unit?.price ? { ...unit, price: unit.price } : null;
}

/** A role that may not see caps gets none on screen (annexe B); the API resolves its own. */
const capOf = (unit: DraftLine['unit']) => unit.maxDiscountPct ?? '0';

/** Adds `qty` (1 when null) of a product in a unit with a price (RG-ART-03). */
function add(state: DraftState, hit: ProductHit, unitId: string, qty: string | null): DraftState {
  const unit = sellableUnit(hit, unitId);
  if (!unit) return state;
  const key = keyOf(hit.id, unitId);
  const added = qty ?? '1';
  if (state.lines.some((line) => line.key === key)) {
    const lines = state.lines.map((line) =>
      line.key === key ? { ...line, qty: addQuantities(line.qty, added) } : line,
    );
    return { ...state, lines, selected: key };
  }
  const { id, sku, name, baseUnit, available, units } = hit;
  const line: DraftLine = {
    key,
    product: { id, sku, name, baseUnit, available, units },
    unit,
    qty: added,
    capPct: capOf(unit),
    discount: null,
  };
  return { ...state, lines: [...state.lines, line], selected: key };
}

/** Another sale unit for a line; merges into the line already holding that unit, if any. */
function changeUnit(state: DraftState, key: string, unitId: string): DraftState {
  const line = state.lines.find((candidate) => candidate.key === key);
  const unit = line && sellableUnit(line.product, unitId);
  if (!line || !unit) return state;
  const target = keyOf(line.product.id, unitId);
  if (target === key) return state;
  if (state.lines.some((candidate) => candidate.key === target)) {
    const lines = state.lines
      .filter((candidate) => candidate.key !== key)
      .map((candidate) =>
        candidate.key === target
          ? { ...candidate, qty: addQuantities(candidate.qty, line.qty) }
          : candidate,
      );
    return { ...state, lines, selected: target };
  }
  // A discount is agreed for one unit, under its cap: another unit starts without one.
  const lines = state.lines.map((candidate) =>
    candidate.key === key
      ? { ...candidate, key: target, unit, capPct: capOf(unit), discount: null }
      : candidate,
  );
  return { ...state, lines, selected: target };
}

/**
 * What the tablet sends: sale units, quantities and discounts as typed, never a price or a total
 * (the API prices again). Null while the customer is missing (RG-DEV-04).
 */
export function saveBody(draft: DraftState): QuoteSave | null {
  if (!draft.customer) return null;
  return {
    customerId: draft.customer.id,
    lines: draft.lines.map((line) => ({
      productUnitId: line.unit.id,
      qty: line.qty,
      discount: line.discount,
    })),
    orderDiscount: draft.orderDiscount,
  };
}

export const saveSignature = (draft: DraftState) => JSON.stringify(saveBody(draft));

/** Saved once, and changed since: the screen no longer matches the saved quote. */
export const unsavedChanges = (draft: DraftState) =>
  !!draft.saved && saveSignature(draft) !== draft.saved.body;

/**
 * The saved quote's price and cap on each line: the API priced it again, and the screen shows
 * what was saved, even if a price changed since the article was added (RG-ART-07).
 */
function applySaved(state: DraftState, quote: Quote, body: string): DraftState {
  const stored = new Map(quote.lines.map((line) => [line.productUnitId, line]));
  const lines = state.lines.map((line) => {
    const saved = stored.get(line.unit.id);
    return saved
      ? { ...line, unit: { ...line.unit, price: saved.unitPrice }, capPct: saved.capPct }
      : line;
  });
  const { id, number, version } = quote;
  return {
    ...state,
    lines,
    saved: { id, number, version, body },
    request: quote.discountRequest,
  };
}

/**
 * The request changed on the saved quote: made or withdrawn here, or decided by the owner. A
 * reading older than the screen's version is left aside. Granted, its code applies as one typed
 * (H53); what was typed meanwhile stays unsaved. Otherwise only the request and the version move.
 */
function requestChanged(state: DraftState, quote: Quote): DraftState {
  const saved = state.saved;
  if (saved?.id !== quote.id || quote.version < saved.version) return state;
  if (quote.discountCode && !state.code) {
    if (!unsavedChanges(state)) {
      const next = applyCode(state, quote);
      return applySaved(next, quote, saveSignature(next));
    }
    const sent = saved.body ? (JSON.parse(saved.body) as QuoteSave | null) : null;
    return applySaved(applyCodeOnTyped(state, quote, sent?.orderDiscount ?? null), quote, '');
  }
  return { ...state, request: quote.discountRequest, saved: { ...saved, version: quote.version } };
}

/**
 * The shortages with the stock available now on the lines of their products: the pad then shows
 * what is really left in each unit (RG-STK-01).
 */
function short(state: DraftState, shortages: StockShortage[]): DraftState {
  const available = new Map(shortages.map((shortage) => [shortage.productId, shortage.available]));
  const lines = state.lines.map((line) => {
    const stock = available.get(line.product.id);
    return stock === undefined ? line : { ...line, product: { ...line.product, available: stock } };
  });
  return { ...state, lines, shortages, shortagesOpen: shortages.length > 0 };
}

/** The product of the line an action changes, whose shortage then no longer holds. */
function productTouched(state: DraftState, action: DraftAction): string | null {
  switch (action.type) {
    case 'add':
      return action.hit.id;
    case 'setQty':
    case 'setUnit':
    case 'remove':
      return state.lines.find((line) => line.key === action.key)?.product.id ?? null;
    default:
      return null;
  }
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  // Built whole, its grants included: nothing of the screen it replaces carries over.
  if (action.type === 'load') return action.draft;
  const reduced = reduce(state, action);
  const next =
    reduced.code && (reduced.lines !== state.lines || reduced.code !== state.code)
      ? withGrants(state, reduced)
      : reduced;
  const touched = productTouched(state, action);
  if (!touched || !next.shortages?.some((shortage) => shortage.productId === touched)) return next;
  const shortages = next.shortages.filter((shortage) => shortage.productId !== touched);
  return { ...next, shortages, shortagesOpen: !!next.shortagesOpen && shortages.length > 0 };
}

function reduce(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'add':
      return add(state, action.hit, action.unitId, action.qty);
    case 'setQty':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, qty: action.qty } : line,
        ),
      };
    case 'setUnit':
      return changeUnit(state, action.key, action.unitId);
    case 'remove':
      return {
        ...state,
        lines: state.lines.filter((line) => line.key !== action.key),
        selected: state.selected === action.key ? null : state.selected,
      };
    case 'select':
      return { ...state, selected: action.key };
    case 'setDiscount':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, discount: action.discount } : line,
        ),
      };
    case 'setOrderDiscount':
      return { ...state, orderDiscount: action.discount };
    case 'setCustomer':
      return { ...state, customer: action.customer };
    case 'saved':
      return applySaved(state, action.quote, action.body);
    case 'codeAttached': {
      // Saved as sent: what was typed meanwhile is still to save.
      const body = saveSignature(applyCode(action.sent, action.quote));
      return applySaved(applyCode(state, action.quote), action.quote, body);
    }
    case 'requestChanged':
      return requestChanged(state, action.quote);
    case 'short':
      return short(state, action.shortages);
    case 'closeShortages':
      return { ...state, shortagesOpen: false };
    case 'submitted':
      return { ...state, selected: null, shortages: [], shortagesOpen: false, order: action.order };
    case 'reset':
      return emptyDraft;
    case 'load':
      return action.draft;
  }
}
