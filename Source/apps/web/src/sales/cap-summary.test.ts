import type { ProductUnitHit } from '@vente-web/shared';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { capSummary } from './cap-summary.js';
import { RIZ, SAVON } from './test-hits.js';

const unit = (price: string | null, maxDiscountPct: string | null): ProductUnitHit => ({
  ...SAVON.units[0]!,
  price,
  maxDiscountPct,
});

describe('capSummary: the discount cap said once per article', () => {
  it('says one cap when the priced units share it, ignoring an unpriced unit', () => {
    // SAVON: pièce and paquet capped at 5 %, carton unpriced at 8 %.
    expect(capSummary(SAVON.units)).toBe(labels.sales.maxDiscount('5'));
  });

  it('says the range when the caps differ', () => {
    expect(capSummary([unit('900', '8'), unit('100', '3'), unit('400', '5')])).toBe(
      labels.sales.maxDiscountRange('3', '8'),
    );
  });

  it('says nothing without a cap', () => {
    expect(capSummary(RIZ.units)).toBeNull();
    expect(capSummary([unit(null, '5')])).toBeNull();
  });
});
