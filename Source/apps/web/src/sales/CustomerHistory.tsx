import { formatDate, formatQty, type CustomerPurchases } from '@vente-web/shared';
import { useEffect, useState } from 'react';

import { customersApi } from '../api/customers.js';
import { labels } from '../labels.js';
import { buttonClass } from '../ui/button.js';
import { CELL, HEAD } from '../ui/document-table.js';
import { Sheet } from '../ui/Sheet.js';
import type { DraftCustomer } from './draft.js';

const text = labels.sales.customer;
const ROW = `${CELL} border-b border-rule py-2 align-top`;

/**
 * The chosen customer's last purchase date, and on demand the latest invoiced lines (H47,
 * RG-DEV-04), read only. A help, not a step: when the server cannot answer, nothing shows.
 */
export function CustomerHistory({ customer }: { customer: DraftCustomer }) {
  const [purchases, setPurchases] = useState<{ id: string; data: CustomerPurchases } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let current = true;
    customersApi.purchases(customer.id).then(
      (data) => current && setPurchases({ id: customer.id, data }),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [customer.id]);

  // A previous customer's history never shows beside the next one.
  if (purchases?.id !== customer.id) return null;
  const { lines } = purchases.data;
  const last = lines[0];
  if (!last) return <span className="text-14 text-ink-2">{text.noPurchase}</span>;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={buttonClass('link', 'md', 'text-ink-2')}
      >
        {text.lastPurchase(formatDate(last.at))}
      </button>
      {open && (
        <Sheet
          title={text.purchasesTitle(customer.name)}
          closeLabel={text.close}
          onClose={() => setOpen(false)}
          width="md"
        >
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-16">
            <thead>
              <tr>
                <th className={`${HEAD} w-28`}>{text.purchaseDate}</th>
                <th className={HEAD}>{text.purchaseItem}</th>
                <th className={`${HEAD} w-24`}>{text.purchaseUnit}</th>
                <th className={`${HEAD} w-24 text-right`}>{text.purchaseQty}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td className={`${ROW} figures`}>{formatDate(line.at)}</td>
                  <td className={`${ROW} break-words`}>{line.name}</td>
                  <td className={ROW}>{line.unitLabel}</td>
                  <td className={`${ROW} figures text-right`}>{formatQty(line.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}
    </>
  );
}
