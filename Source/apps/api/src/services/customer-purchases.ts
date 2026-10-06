import { CUSTOMER_PURCHASES_MAX_LINES, type CustomerPurchases } from '@vente-web/shared';

import type { Db } from '../db.js';
import { findCustomer } from './customers.js';

/**
 * A customer's latest invoiced lines, the newest invoice first (H47, RG-DEV-04), counting the
 * records merged into this one. An invoice cancelled in full by a credit note is no purchase.
 */
export async function customerPurchases(db: Db, id: string): Promise<CustomerPurchases> {
  await findCustomer(db, id);
  const lines = await db.orderLine.findMany({
    where: {
      order: {
        customer: { OR: [{ id }, { mergedIntoId: id }] },
        invoice: { is: { status: { not: 'CREDITED' } } },
      },
    },
    orderBy: [{ order: { invoice: { issuedAt: 'desc' } } }, { position: 'asc' }],
    take: CUSTOMER_PURCHASES_MAX_LINES,
    select: {
      name: true,
      unitLabel: true,
      qty: true,
      order: { select: { invoice: { select: { issuedAt: true } } } },
    },
  });
  return {
    lines: lines.map(({ name, unitLabel, qty, order }) => ({
      // Always set: only invoiced orders pass the filter.
      at: (order.invoice?.issuedAt ?? new Date(0)).toISOString(),
      name,
      unitLabel,
      qty: qty.toFixed(2),
    })),
  };
}
