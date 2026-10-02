import type { ProductHit, ProductSearchResult, Quote } from '@vente-web/shared';

import type { DraftCustomer, DraftState } from './draft.js';

/** Search hits shaped as the API returns them (T-021), for the quote screen tests. */
export const SAVON: ProductHit = {
  id: '0192a4f0-0000-7000-8000-000000000101',
  sku: 'SAV-001',
  name: 'Savon de Marseille 400 g',
  category: { id: '0192a4f0-0000-7000-8000-000000000201', name: 'Savons et hygiène' },
  baseUnit: 'pièce',
  available: '420',
  units: [
    {
      id: '0192a4f0-0000-7000-8000-000000000111',
      label: 'pièce',
      factor: '1',
      isBase: true,
      barcode: '3760000000017',
      price: '1500',
      maxDiscountPct: '5',
    },
    {
      id: '0192a4f0-0000-7000-8000-000000000112',
      label: 'paquet',
      factor: '6',
      isBase: false,
      barcode: '3760000000024',
      price: '8500',
      maxDiscountPct: '5',
    },
    {
      id: '0192a4f0-0000-7000-8000-000000000113',
      label: 'carton',
      factor: '72',
      isBase: false,
      barcode: null,
      price: null,
      maxDiscountPct: '8',
    },
  ],
};

export const RIZ: ProductHit = {
  id: '0192a4f0-0000-7000-8000-000000000102',
  sku: 'RIZ-001',
  name: 'Riz blanc',
  category: { id: '0192a4f0-0000-7000-8000-000000000202', name: 'Alimentation' },
  baseUnit: 'kg',
  available: '1250.5',
  units: [
    {
      id: '0192a4f0-0000-7000-8000-000000000121',
      label: 'kg',
      factor: '1',
      isBase: true,
      barcode: null,
      price: '3200',
      maxDiscountPct: null,
    },
    {
      id: '0192a4f0-0000-7000-8000-000000000122',
      label: 'sac 50 kg',
      factor: '50',
      isBase: false,
      barcode: null,
      price: '150000',
      maxDiscountPct: null,
    },
  ],
};

export function searchResult(
  items: ProductHit[],
  exact: ProductSearchResult['exact'] = null,
  more = false,
): ProductSearchResult {
  return { exact, items, more };
}

export const CUSTOMER: DraftCustomer = {
  id: '0192a4f0-0000-7000-8000-000000000301',
  name: 'Rasoa Hanta',
  phone: '0341122233',
};

export const QUOTE_ID = '0192a4f0-0000-7000-8000-000000000401';

/**
 * A quote as the API returns it once saved (T-030), with the lines of a draft; `prices` by unit
 * id stand for a price changed since the lines were added. Amounts do not matter here.
 */
export function savedQuote(
  draft: DraftState,
  number: string,
  version = 1,
  prices: Record<string, string> = {},
): Quote {
  const lines = draft.lines.map((line, index) => ({
    position: index + 1,
    productId: line.product.id,
    productUnitId: line.unit.id,
    sku: line.product.sku,
    name: line.product.name,
    unitLabel: line.unit.label,
    factor: line.unit.factor,
    baseUnit: line.product.baseUnit,
    qty: line.qty,
    unitPrice: prices[line.unit.id] ?? line.unit.price,
    capPct: line.capPct,
    gross: '0.00',
    discountPct: '0.00',
    discountAmount: '0.00',
    discountSource: 'NONE' as const,
    net: '0.00',
  }));
  const zero = '0.00';
  return {
    id: QUOTE_ID,
    number,
    version,
    customer: CUSTOMER,
    salesUser: { id: '0192a4f0-0000-7000-8000-000000000501', fullName: 'Vola Commerciale' },
    lines,
    grossTotal: zero,
    lineDiscounts: zero,
    subtotal: zero,
    orderDiscountPct: null,
    orderDiscount: zero,
    discountTotal: zero,
    discountCode: null,
    discountRequest: null,
    total: zero,
    createdAt: '2026-09-26T07:00:00.000Z',
    updatedAt: '2026-09-26T07:00:00.000Z',
  };
}
