import { describe, expect, it } from 'vitest';

import {
  draftReducer,
  emptyDraft,
  saveBody,
  saveSignature,
  unsavedChanges,
  type DraftAction,
  type DraftState,
} from './draft.js';
import { CUSTOMER, SAVON, savedQuote } from './test-hits.js';

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
