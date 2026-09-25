import type { ProductHit, ProductSearchResult } from '@vente-web/shared';

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
