import type { DiscountRequestSummary } from '@vente-web/shared';

import { RIJA } from './fake-api.js';

export const REQUEST_ID = '0192a4f0-0000-7000-8000-000000000601';
export const REASONS = ['Client fidèle', 'Achat en volume', 'Article abîmé', 'Geste commercial'];

/**
 * A request to the owner (T-033), made by Rija at 10:00 on a product, waiting until a day end far
 * ahead: still pending whenever the test runs (H54).
 */
export function requestOf(
  product: { id: string; sku: string; name: string },
  overrides: Partial<DiscountRequestSummary> = {},
): DiscountRequestSummary {
  return {
    id: REQUEST_ID,
    status: 'PENDING',
    reason: REASONS[0]!,
    note: null,
    items: [
      {
        id: '0192a4f0-0000-7000-8000-000000000602',
        product: { id: product.id, sku: product.sku, name: product.name },
        requested: { kind: 'pct', value: '12.00' },
        granted: null,
      },
    ],
    requestedBy: { id: RIJA.id, fullName: RIJA.fullName },
    createdAt: '2026-10-03T07:00:00.000Z',
    expiresAt: '2099-12-31T15:00:00.000Z',
    closedAt: null,
    ...overrides,
  };
}
