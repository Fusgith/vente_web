import { describe, expect, it } from 'vitest';

import { sumAmounts } from './decimal.js';
import {
  computeQuote,
  discountAmount,
  discountEntrySchema,
  discountRate,
  grantsFor,
  type DiscountEntry,
  type QuoteLineInput,
} from './discount.js';

const pct = (value: string): DiscountEntry => ({ kind: 'pct', value });
const amount = (value: string): DiscountEntry => ({ kind: 'amount', value });

function line(overrides: Partial<QuoteLineInput> = {}): QuoteLineInput {
  return { quantity: '1', unitPrice: '10000', capPct: '0', discount: null, ...overrides };
}

describe('discount entries (RG-REM-06)', () => {
  it('accepts a rate up to 100 % with 2 decimals, or an amount with 2 decimals', () => {
    for (const entry of [pct('5'), pct('2.5'), pct('100'), amount('1500'), amount('0.5')]) {
      expect(discountEntrySchema.safeParse(entry).success, entry.value).toBe(true);
    }
    for (const entry of [pct('100.01'), pct('-1'), pct('1.234'), pct('5,5'), amount('1.234')]) {
      expect(discountEntrySchema.safeParse(entry).success, entry.value).toBe(false);
    }
  });

  it('turns a rate into an amount rounded half-up to the cent (RG-DEV-05)', () => {
    expect(discountAmount(pct('5'), '13500.00')).toBe('675.00');
    expect(discountAmount(pct('2.5'), '1234.57')).toBe('30.86');
    expect(discountAmount(pct('10'), '0.05')).toBe('0.01');
    expect(discountAmount(amount('500'), '13500.00')).toBe('500.00');
  });

  it('shows the rate an amount stands for', () => {
    expect(discountRate('675.00', '13500.00')).toBe('5.00');
    expect(discountRate('100.00', '3000.00')).toBe('3.33');
    expect(discountRate('0.00', '0.00')).toBe('0.00');
  });

  it('refuses a malformed entry instead of computing with it', () => {
    expect(() =>
      computeQuote({ lines: [line({ discount: pct('120') })], orderDiscount: null }),
    ).toThrow(RangeError);
  });
});

describe('computeQuote: line discounts (RG-REM-01/02/06)', () => {
  const soap = line({ quantity: '3', unitPrice: '4500', capPct: '5', discount: pct('5') });
  const carton = line({
    quantity: '2',
    unitPrice: '25000',
    capPct: '10',
    discount: amount('2000'),
  });

  it('computes the table and its totals (RG-DEV-05)', () => {
    const quote = computeQuote({ lines: [soap, carton], orderDiscount: null });

    expect(quote.lines).toEqual([
      expect.objectContaining({
        gross: '13500.00',
        discount: '675.00',
        discountPct: '5.00',
        net: '12825.00',
        maxDiscount: '675.00',
        headroom: '0.00',
        source: 'WITHIN_CAP',
        withinLimit: true,
      }),
      expect.objectContaining({
        gross: '50000.00',
        discount: '2000.00',
        discountPct: '4.00',
        net: '48000.00',
        maxDiscount: '5000.00',
        headroom: '3000.00',
      }),
    ]);
    expect(quote).toMatchObject({
      grossTotal: '63500.00',
      lineDiscounts: '2675.00',
      subtotal: '60825.00',
      maxOrderDiscount: '3000.00',
      orderDiscount: '0.00',
      orderDiscountPct: null,
      orderDiscountSource: 'NONE',
      discountTotal: '2675.00',
      total: '60825.00',
      withinLimits: true,
    });
  });

  it('allows the cap typed as a rate or as the amount shown, not a cent more', () => {
    const at = (discount: DiscountEntry) =>
      computeQuote({ lines: [line({ capPct: '5', discount })], orderDiscount: null }).lines[0];

    expect(at(pct('5'))).toMatchObject({ withinLimit: true, maxDiscount: '500.00' });
    expect(at(amount('500'))?.withinLimit).toBe(true);
    expect(at(pct('5.01'))?.withinLimit).toBe(false);
    expect(at(amount('500.01'))?.withinLimit).toBe(false);
  });

  it('lets a line with a 0 % cap take a discount only through a code', () => {
    const quote = (granted: DiscountEntry | null) =>
      computeQuote({ lines: [line({ discount: pct('15'), granted })], orderDiscount: null });

    expect(quote(null)).toMatchObject({ withinLimits: false, lines: [{ maxDiscount: '0.00' }] });
    expect(quote(pct('15'))).toMatchObject({
      withinLimits: true,
      lines: [{ discount: '1500.00', source: 'CODE', headroom: '0.00' }],
    });
    expect(quote(amount('1000')).withinLimits).toBe(false);
  });

  it('widens the limit to the suggested discount, the larger of the two (H62)', () => {
    const at = (discount: DiscountEntry, suggestedPct: string | null) =>
      computeQuote({ lines: [line({ capPct: '5', discount, suggestedPct })], orderDiscount: null })
        .lines[0];

    expect(at(pct('10'), '10')).toMatchObject({
      withinLimit: true,
      maxDiscount: '1000.00',
      source: 'RULE',
    });
    expect(at(pct('10.01'), '10')?.withinLimit).toBe(false);
    // Covered by the rule, the discount is the rule's; beyond it, within the cap.
    expect(at(pct('3'), '4')).toMatchObject({ maxDiscount: '500.00', source: 'RULE' });
    expect(at(pct('5'), '4')).toMatchObject({ withinLimit: true, source: 'WITHIN_CAP' });
    expect(at(pct('5'), null)?.source).toBe('WITHIN_CAP');
    // The headroom left for the total is the rule's.
    expect(at(pct('2'), '10')?.headroom).toBe('800.00');
  });

  it('marks a line without discount NONE', () => {
    const quote = computeQuote({ lines: [line({ capPct: '5' })], orderDiscount: null });
    expect(quote.lines[0]).toMatchObject({ discount: '0.00', discountPct: '0.00', source: 'NONE' });
  });
});

describe('computeQuote: order discount (RG-REM-06, H23)', () => {
  const lines = [
    line({ unitPrice: '60000', capPct: '5' }), // headroom 3 000
    line({ unitPrice: '20000', capPct: '5' }), // headroom 1 000
    line({ unitPrice: '5000' }), // cap 0: headroom 0
  ];

  it('is bounded by the headroom and spread pro rata of it', () => {
    const quote = computeQuote({ lines, orderDiscount: amount('2000') });

    expect(quote).toMatchObject({
      subtotal: '85000.00',
      maxOrderDiscount: '4000.00',
      orderDiscount: '2000.00',
      orderDiscountSource: 'WITHIN_CAP',
      discountTotal: '2000.00',
      total: '83000.00',
      withinLimits: true,
    });
    expect(quote.lines.map((l) => l.orderDiscountShare)).toEqual(['1500.00', '500.00', '0.00']);
  });

  it('keeps the rate typed, and refuses more than the headroom', () => {
    const quote = computeQuote({ lines, orderDiscount: pct('5') });
    expect(quote).toMatchObject({
      orderDiscount: '4250.00',
      orderDiscountPct: '5.00',
      orderWithinLimit: false,
      withinLimits: false,
    });
  });

  it('takes the line discounts off the headroom', () => {
    const quote = computeQuote({
      lines: [line({ unitPrice: '60000', capPct: '5', discount: amount('2500') })],
      orderDiscount: amount('500'),
    });
    expect(quote).toMatchObject({ maxOrderDiscount: '500.00', withinLimits: true });
    expect(quote.lines[0]?.orderDiscountShare).toBe('500.00');
  });

  it('follows the code covering the total, spread pro rata of the nets', () => {
    const quote = computeQuote({ lines, orderDiscount: pct('10'), orderGranted: pct('10') });

    expect(quote).toMatchObject({
      maxOrderDiscount: '8500.00',
      orderDiscount: '8500.00',
      orderDiscountSource: 'CODE',
      withinLimits: true,
    });
    expect(quote.lines.map((l) => l.orderDiscountShare)).toEqual(['6000.00', '2000.00', '500.00']);
  });

  it('spreads the cents left to the largest remainders, never below zero', () => {
    const equal = Array.from({ length: 4 }, () => line({ unitPrice: '10', capPct: '10' }));
    // Rounding each 0,005 share half-up would give 4 × 0,01 and a gap of −0,02 on one line.
    const quote = computeQuote({ lines: equal, orderDiscount: amount('0.02') });
    expect(quote.lines.map((l) => l.orderDiscountShare)).toEqual(['0.01', '0.01', '0.00', '0.00']);

    const three = computeQuote({ lines: equal.slice(0, 3), orderDiscount: amount('0.10') });
    expect(three.lines.map((l) => l.orderDiscountShare)).toEqual(['0.04', '0.03', '0.03']);
  });

  it('never leaves a product beyond its cap, whatever the figures', () => {
    let seed = 7;
    const next = (max: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % max;
    };
    for (let round = 0; round < 200; round++) {
      const quoteLines = Array.from({ length: 1 + next(6) }, () =>
        line({
          quantity: String(1 + next(20)),
          unitPrice: `${next(90000)}.${String(next(100)).padStart(2, '0')}`,
          capPct: String(next(16)),
        }),
      );
      const room = computeQuote({ lines: quoteLines, orderDiscount: null }).maxOrderDiscount;
      const cents = BigInt(room.replace('.', ''));
      const wanted = cents === 0n ? 0n : BigInt(next(Number(cents) + 1));
      const discount = amount((Number(wanted) / 100).toFixed(2));
      const quote = computeQuote({ lines: quoteLines, orderDiscount: discount });

      expect(quote.withinLimits).toBe(true);
      expect(sumAmounts(quote.lines.map((l) => l.orderDiscountShare))).toBe(quote.orderDiscount);
      for (const l of quote.lines) {
        const taken = sumAmounts([l.discount, l.orderDiscountShare]);
        expect(Number(taken)).toBeLessThanOrEqual(Number(l.maxDiscount));
        expect(Number(l.orderDiscountShare)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('grantsFor — an owner’s code over the lines (RG-REM-04, H41)', () => {
  const SOAP = 'soap';
  const RICE = 'rice';
  const lines = [
    { productId: SOAP, quantity: '2', unitPrice: '4500' },
    { productId: RICE, quantity: '1', unitPrice: '150000' },
    { productId: SOAP, quantity: '1', unitPrice: '25000' },
  ];

  it('holds a rate for every line of the product, and gives the total its grant', () => {
    expect(
      grantsFor(
        [
          { productId: SOAP, discount: { kind: 'pct', value: '12' } },
          { productId: null, discount: { kind: 'amount', value: '5000' } },
        ],
        lines,
      ),
    ).toEqual({
      lines: [{ kind: 'pct', value: '12' }, null, { kind: 'pct', value: '12' }],
      order: { kind: 'amount', value: '5000' },
    });
  });

  it('splits an amount over the lines of the product pro rata of their gross, to the cent', () => {
    // Gross 9 000 and 25 000: 1 000 → 264.70… and 735.29…, the cent left to the largest rest.
    const { lines: granted, order } = grantsFor(
      [{ productId: SOAP, discount: { kind: 'amount', value: '1000' } }],
      lines,
    );
    expect(granted).toEqual([
      { kind: 'amount', value: '264.71' },
      null,
      { kind: 'amount', value: '735.29' },
    ]);
    expect(order).toBeNull();
  });
});
