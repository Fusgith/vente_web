import type { Order } from '@vente-web/shared';
import { useEffect, useState } from 'react';

import { discountRulesApi } from '../api/discount-rules.js';

interface Read {
  orderId: string;
  version: number;
  pcts: (string | null)[];
}

/**
 * The suggested discount of each line of the order at the register, in the order of its lines
 * (H62): read again whenever the order changes (a quantity lowered may lose a rule). Only a read
 * of the version shown counts; a failed read suggests nothing — the caps still hold.
 */
export function useSuggestedDiscounts(order: Order): (string | null)[] {
  const [read, setRead] = useState<Read | null>(null);
  const { id, version } = order;

  useEffect(() => {
    let current = true;
    discountRulesApi.suggested(id).then(
      (suggested) => {
        if (current) {
          setRead({
            orderId: id,
            version: suggested.version,
            pcts: suggested.lines.map((line) => line.pct),
          });
        }
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [id, version]);

  return read && read.orderId === id && read.version === version
    ? read.pcts
    : order.lines.map(() => null);
}
