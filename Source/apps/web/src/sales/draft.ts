import {
  addQuantities,
  type DiscountEntry,
  type ProductHit,
  type ProductUnitHit,
} from '@vente-web/shared';

/**
 * Lines picked on the quote screen, kept in memory until quotes are saved (T-030).
 * One line per product × sale unit (RG-DEV-05): adding the same pair again adds to its quantity,
 * which is how a second scan of the same article counts +1 (RG-DEV-06 §3).
 */
export interface DraftLine {
  key: string;
  /** `available`: the stock when the line was added, shown per unit on the quantity pad. */
  product: Pick<ProductHit, 'id' | 'sku' | 'name' | 'baseUnit' | 'available' | 'units'>;
  unit: ProductUnitHit & { price: string };
  qty: string;
  capPct: string;
  discount: DiscountEntry | null;
  granted?: DiscountEntry | null;
}

export interface DraftState {
  lines: DraftLine[];
  /** The line whose quantity pad is open: the last one added, or the one tapped. */
  selected: string | null;
  clientId: string | null;
  orderDiscount: DiscountEntry | null;
  orderGranted?: DiscountEntry | null;
}

export type DraftAction =
  | { type: 'add'; hit: ProductHit; unitId: string; qty: string | null }
  | { type: 'setQty'; key: string; qty: string }
  | { type: 'setUnit'; key: string; unitId: string }
  | { type: 'remove'; key: string }
  | { type: 'select'; key: string | null }
  | { type: 'setDiscount'; key: string; discount: DiscountEntry | null }
  | { type: 'setOrderDiscount'; discount: DiscountEntry | null }
  | { type: 'setClient'; clientId: string | null };

export const emptyDraft: DraftState = {
  lines: [],
  selected: null,
  clientId: null,
  orderDiscount: null,
};

const keyOf = (productId: string, unitId: string) => `${productId}:${unitId}`;

function sellableUnit(product: DraftLine['product'], unitId: string): DraftLine['unit'] | null {
  const unit = product.units.find((candidate) => candidate.id === unitId);
  return unit?.price ? { ...unit, price: unit.price } : null;
}

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
  // TODO: Resolve proper capPct from unit -> product -> category -> fallback (RG-REM-01)
  // For now, defaulting to '0' to satisfy the type. T-031 implementation needs it.
  const capPct = '0';
  const line: DraftLine = {
    key,
    product: { id, sku, name, baseUnit, available, units },
    unit,
    qty: added,
    capPct,
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
  const lines = state.lines.map((candidate) =>
    candidate.key === key ? { ...candidate, key: target, unit } : candidate,
  );
  return { ...state, lines, selected: target };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
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
    case 'setClient':
      return { ...state, clientId: action.clientId };
  }
}
