import { createContext, useContext, useEffect, useState } from 'react';

import { salesDiscountApi } from '../api/sales-discount.js';

/** Whether the quote screen shows discounts (H60); on outside the salesperson's workspace. */
export const SalesDiscountContext = createContext(true);
export const useSalesDiscount = () => useContext(SalesDiscountContext);

/**
 * The admin's setting (H60), read once; `fixed` skips the server (the design gallery). Off until
 * the server answers, and when it does not: the salesperson never announces a discount by mistake.
 */
export function useSalesDiscountSetting(fixed?: boolean): boolean {
  const [enabled, setEnabled] = useState(fixed ?? false);
  useEffect(() => {
    if (fixed !== undefined) return;
    let live = true;
    salesDiscountApi.read().then(
      (found) => live && setEnabled(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [fixed]);
  return enabled;
}
