import { computeQuote, type Quote } from '@vente-web/shared';
import { describe, expect, it } from 'vitest';

import { quoteInput } from './discount-entry.js';
import {
  draftReducer,
  emptyDraft,
  grantedAt,
  orderBroughtDown,
  saveBody,
  saveSignature,
  unsavedChanges,
  type DraftAction,
  type DraftState,
} from './draft.js';
import { CUSTOMER, RIZ, SAVON, savedQuote } from './test-hits.js';

const [PIECE, PAQUET, CARTON] = SAVON.units;

function run(...actions: DraftAction[]): DraftState {
  return actions.reduce(draftReducer, emptyDraft);
}

const add = (unitId: string, qty: string | null = null): DraftAction => ({
  type: 'add',
  hit: SAVON,
  unitId,
  qty,
});

describe('draftReducer', () => {
  it('adds a line in the unit picked and selects it for the quantity pad', () => {
    const state = run(add(PAQUET!.id, '3'));
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]).toMatchObject({ qty: '3', unit: { id: PAQUET!.id, price: '8500' } });
    expect(state.selected).toBe(state.lines[0]!.key);
  });

  it('adds 1 when no quantity is given', () => {
    expect(run(add(PIECE!.id)).lines[0]!.qty).toBe('1');
  });

  it('counts the same article in the same unit on one line (a second scan is +1)', () => {
    const state = run(add(PIECE!.id), add(PIECE!.id), add(PIECE!.id, '2.5'));
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]!.qty).toBe('4.5');
  });

  it('keeps one line per sale unit', () => {
    const state = run(add(PIECE!.id), add(PAQUET!.id));
    expect(state.lines.map((line) => line.unit.label)).toEqual(['pièce', 'paquet']);
    expect(state.selected).toBe(state.lines[1]!.key);
  });

  it('ignores a unit without a price or unknown', () => {
    expect(run(add(CARTON!.id))).toEqual(emptyDraft);
    expect(run(add('0192a4f0-0000-7000-8000-00000000ffff'))).toEqual(emptyDraft);
  });

  it('sets the quantity of a line', () => {
    const state = run(add(PIECE!.id));
    const key = state.lines[0]!.key;
    expect(draftReducer(state, { type: 'setQty', key, qty: '12' }).lines[0]!.qty).toBe('12');
  });

  it('changes the unit of a line, keeping its quantity', () => {
    const state = run(add(PIECE!.id, '4'));
    const next = draftReducer(state, {
      type: 'setUnit',
      key: state.lines[0]!.key,
      unitId: PAQUET!.id,
    });
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]).toMatchObject({ qty: '4', unit: { label: 'paquet' } });
    expect(next.selected).toBe(next.lines[0]!.key);
  });

  it('drops the discount of a line whose unit changes: it was agreed under another cap', () => {
    const state = run(add(PIECE!.id, '4'));
    const key = state.lines[0]!.key;
    const discounted = draftReducer(state, {
      type: 'setDiscount',
      key,
      discount: { kind: 'pct', value: '5' },
    });
    expect(discounted.lines[0]!.discount).toEqual({ kind: 'pct', value: '5' });
    const next = draftReducer(discounted, { type: 'setUnit', key, unitId: PAQUET!.id });
    expect(next.lines[0]).toMatchObject({ unit: { label: 'paquet' }, discount: null });
  });

  it('merges into the line that already holds the new unit', () => {
    const state = run(add(PAQUET!.id, '2'), add(PIECE!.id, '4'));
    const next = draftReducer(state, {
      type: 'setUnit',
      key: state.lines[1]!.key,
      unitId: PAQUET!.id,
    });
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]).toMatchObject({ qty: '6', unit: { label: 'paquet' } });
    expect(next.selected).toBe(next.lines[0]!.key);
  });

  it('refuses a unit without a price', () => {
    const state = run(add(PIECE!.id));
    const key = state.lines[0]!.key;
    expect(draftReducer(state, { type: 'setUnit', key, unitId: CARTON!.id })).toBe(state);
  });

  it('removes a line and closes its pad', () => {
    const state = run(add(PIECE!.id), add(PAQUET!.id));
    const [first, second] = state.lines;
    const withoutSecond = draftReducer(state, { type: 'remove', key: second!.key });
    expect(withoutSecond).toEqual({ ...emptyDraft, lines: [first], selected: null });
    const reselected = draftReducer(state, { type: 'select', key: second!.key });
    expect(draftReducer(reselected, { type: 'remove', key: first!.key }).selected).toBe(
      second!.key,
    );
  });
});

describe('saving the draft (T-030)', () => {
  const withCustomer = (state: DraftState) =>
    draftReducer(state, { type: 'setCustomer', customer: CUSTOMER });
  const saved = (state: DraftState, prices: Record<string, string> = {}) =>
    draftReducer(state, {
      type: 'saved',
      quote: savedQuote(state, 'D-2026-000001', 1, prices),
      body: saveSignature(state),
    });

  it('sends units, quantities and discounts as typed, never a price, and only with a customer', () => {
    const state = run(add(PAQUET!.id, '2'), {
      type: 'setOrderDiscount',
      discount: { kind: 'amount', value: '100' },
    });
    expect(saveBody(state)).toBeNull();
    expect(saveBody(withCustomer(state))).toEqual({
      customerId: CUSTOMER.id,
      lines: [{ productUnitId: PAQUET!.id, qty: '2', discount: null }],
      orderDiscount: { kind: 'amount', value: '100' },
    });
  });

  it('shows the prices saved, and tells a change made since', () => {
    const state = saved(withCustomer(run(add(PAQUET!.id, '2'))), { [PAQUET!.id]: '9000.00' });
    expect(state.saved).toMatchObject({ number: 'D-2026-000001', version: 1 });
    expect(state.lines[0]!.unit.price).toBe('9000.00');
    expect(unsavedChanges(state)).toBe(false);

    const key = state.lines[0]!.key;
    expect(unsavedChanges(draftReducer(state, { type: 'setQty', key, qty: '3' }))).toBe(true);
    // The same quantity confirmed again changes nothing.
    expect(unsavedChanges(draftReducer(state, { type: 'setQty', key, qty: '2' }))).toBe(false);
  });

  it('keeps unsaved what was typed while the quote was being saved', () => {
    const sent = withCustomer(run(add(PAQUET!.id, '2')));
    const typed = draftReducer(sent, { type: 'setQty', key: sent.lines[0]!.key, qty: '5' });
    const state = draftReducer(typed, {
      type: 'saved',
      quote: savedQuote(sent, 'D-2026-000001'),
      body: saveSignature(sent),
    });
    expect(unsavedChanges(state)).toBe(true);
  });
});

describe('draftReducer: validation refused for want of stock (RG-CMD-02)', () => {
  const [KG] = RIZ.units;
  const shortage = (productId: string, available: string) => ({
    productId,
    sku: 'X',
    name: 'X',
    baseUnit: 'pièce',
    available,
    requested: '99.00',
    lines: [1],
  });
  const withRice = run(add(PAQUET!.id, '2'), {
    type: 'add',
    hit: RIZ,
    unitId: KG!.id,
    qty: '3',
  });
  const short = draftReducer(withRice, {
    type: 'short',
    shortages: [shortage(SAVON.id, '9.00'), shortage(RIZ.id, '1.00')],
  });

  it('keeps the shortages, opens their sheet and shows the stock left on the lines', () => {
    expect(short.shortagesOpen).toBe(true);
    expect(short.lines.map((line) => line.product.available)).toEqual(['9.00', '1.00']);
  });

  it('drops the shortage of a product whose line changes, the sheet closing with the last', () => {
    const soapKey = short.lines[0]!.key;
    const fewer = draftReducer(short, { type: 'setQty', key: soapKey, qty: '1' });
    expect(fewer.shortages?.map((s) => s.productId)).toEqual([RIZ.id]);
    expect(fewer.shortagesOpen).toBe(true);
    const none = draftReducer(fewer, { type: 'remove', key: short.lines[1]!.key });
    expect(none.shortages).toEqual([]);
    expect(none.shortagesOpen).toBe(false);
  });

  it('starts a new quote once the ticket is given', () => {
    expect(draftReducer(short, { type: 'reset' })).toEqual(emptyDraft);
  });
});

describe('draftReducer: the owner’s code attached (T-034b, H42)', () => {
  const [KG] = RIZ.units;
  // Soap in packs (gross 17 000) and in pieces (4 500), rice by the kg; saved as version 1.
  const lines = run(add(PAQUET!.id, '2'), add(PIECE!.id, '3'), {
    type: 'add',
    hit: RIZ,
    unitId: KG!.id,
    qty: '3',
  });
  const customer = draftReducer(lines, { type: 'setCustomer', customer: CUSTOMER });
  const saved = draftReducer(customer, {
    type: 'saved',
    quote: savedQuote(customer, 'D-2026-000001'),
    body: saveSignature(customer),
  });

  /** 2 150 MGA on the soap, split pro rata of the gross of its two lines, and 10 % on the total. */
  function withCode(draft: DraftState): Quote {
    const quote = savedQuote(draft, 'D-2026-000001', 2);
    const shares: Record<string, string> = { [PAQUET!.id]: '1700.00', [PIECE!.id]: '450.00' };
    return {
      ...quote,
      lines: quote.lines.map((line) => {
        const share = shares[line.productUnitId];
        return share ? { ...line, discountAmount: share, discountSource: 'CODE' as const } : line;
      }),
      orderDiscountPct: '10.00',
      discountCode: {
        code: 'R7K4-29QP',
        items: [
          { productId: SAVON.id, discount: { kind: 'amount', value: '2150.00' } },
          { productId: null, discount: { kind: 'pct', value: '10' } },
        ],
      },
    };
  }

  const attached = draftReducer(saved, {
    type: 'codeAttached',
    quote: withCode(saved),
    sent: saved,
  });

  it('takes the grants as the API applied them, beyond the caps, the screen matching the save', () => {
    expect(attached.code?.code).toBe('R7K4-29QP');
    expect(attached.lines.map((line) => line.discount)).toEqual([
      { kind: 'amount', value: '1700.00' },
      { kind: 'amount', value: '450.00' },
      null,
    ]);
    expect(attached.orderDiscount).toEqual({ kind: 'pct', value: '10' });
    expect(attached.lines.map((line) => line.granted)).toEqual([
      { kind: 'amount', value: '1700.00' },
      { kind: 'amount', value: '450.00' },
      null,
    ]);
    expect(attached.orderGranted).toEqual({ kind: 'pct', value: '10' });
    // 10 % on the packs, beyond their 5 % cap: within what the code grants.
    expect(computeQuote(quoteInput(attached)).withinLimits).toBe(true);
    expect(attached.saved?.version).toBe(2);
    expect(unsavedChanges(attached)).toBe(false);
  });

  it('splits an amount granted again as the lines change, a discount at its share following', () => {
    const more = draftReducer(attached, {
      type: 'setQty',
      key: attached.lines[1]!.key,
      qty: '6',
    });
    // Gross 17 000 and 9 000: 1 405,77 and 744,23, both lines still at their share.
    expect(more.lines.map((line) => line.granted?.value ?? null)).toEqual([
      '1405.77',
      '744.23',
      null,
    ]);
    expect(more.lines.map((line) => line.discount?.value ?? null)).toEqual([
      '1405.77',
      '744.23',
      null,
    ]);
    expect(computeQuote(quoteInput(more)).withinLimits).toBe(true);
    // The pad's maximum while 6 is typed, before it is confirmed.
    expect(grantedAt(attached, attached.lines[1]!.key, '6')).toEqual({
      kind: 'amount',
      value: '744.23',
    });
  });

  it('keeps a discount typed apart from its share', () => {
    const typed = draftReducer(attached, {
      type: 'setDiscount',
      key: attached.lines[0]!.key,
      discount: { kind: 'amount', value: '1000' },
    });
    const more = draftReducer(typed, { type: 'setQty', key: attached.lines[1]!.key, qty: '6' });
    expect(more.lines[0]!.discount).toEqual({ kind: 'amount', value: '1000' });
    expect(more.lines[1]!.discount).toEqual({ kind: 'amount', value: '744.23' });
  });

  it('gives a line of the product added again its share', () => {
    const removed = draftReducer(attached, { type: 'remove', key: attached.lines[1]!.key });
    // Alone, the packs take the whole 2 150.
    expect(removed.lines[0]!.discount).toEqual({ kind: 'amount', value: '2150.00' });
    const back = draftReducer(removed, add(PIECE!.id, '3'));
    expect(back.lines.map((line) => line.discount?.value ?? null)).toEqual([
      '1700.00',
      null,
      '450.00',
    ]);
  });

  it('leaves unsaved what was typed while the code went on', () => {
    const rice = saved.lines[2]!.key;
    const meanwhile = draftReducer(saved, { type: 'setQty', key: rice, qty: '5' });
    const state = draftReducer(meanwhile, {
      type: 'codeAttached',
      quote: withCode(saved),
      sent: saved,
    });
    expect(state.code?.code).toBe('R7K4-29QP');
    expect(state.lines[2]!.qty).toBe('5');
    expect(unsavedChanges(state)).toBe(true);
    expect(unsavedChanges(draftReducer(state, { type: 'setQty', key: rice, qty: '3' }))).toBe(
      false,
    );
  });

  it('keeps the discounts of the lines and the total the code does not cover', () => {
    const typed = draftReducer(saved, {
      type: 'setOrderDiscount',
      discount: { kind: 'amount', value: '500' },
    });
    const quote = withCode(typed);
    const productsOnly = {
      ...quote,
      subtotal: '28950.00',
      orderDiscount: '500.00',
      orderDiscountPct: null,
      discountCode: { code: 'R7K4-29QP', items: quote.discountCode!.items.slice(0, 1) },
    };
    const state = draftReducer(typed, { type: 'codeAttached', quote: productsOnly, sent: typed });
    expect(orderBroughtDown(typed, productsOnly)).toBe(false);
    expect(state.orderDiscount).toEqual({ kind: 'amount', value: '500' });
    expect(state.orderGranted).toBeNull();
    expect(state.lines[2]!.discount).toBeNull();
  });

  it('takes the total’s discount the API brought down, the grants leaving it no headroom', () => {
    const typed = draftReducer(saved, {
      type: 'setOrderDiscount',
      discount: { kind: 'pct', value: '2' },
    });
    const quote = withCode(typed);
    const lowered = {
      ...quote,
      subtotal: '28950.00',
      orderDiscount: '0.00',
      orderDiscountPct: null,
      discountCode: { code: 'R7K4-29QP', items: quote.discountCode!.items.slice(0, 1) },
    };
    const state = draftReducer(typed, { type: 'codeAttached', quote: lowered, sent: typed });
    expect(orderBroughtDown(typed, lowered)).toBe(true);
    expect(state.orderDiscount).toBeNull();
    expect(unsavedChanges(state)).toBe(false);
  });

  it('starts the next quote without the code', () => {
    expect(draftReducer(attached, { type: 'reset' })).toEqual(emptyDraft);
  });
});
