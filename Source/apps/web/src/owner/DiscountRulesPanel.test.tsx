import type { DiscountRule } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { SAVON, searchResult } from '../sales/test-hits.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { DiscountRulesPanel } from './DiscountRulesPanel.js';

const text = labels.discountRules;

const RULE = '0192a4f0-0000-7000-8000-000000000701';
const LIST = 'GET /discount-rules';
const ADD = 'POST /discount-rules';
const CHANGE = `PUT /discount-rules/${RULE}`;

const rule = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: RULE,
  kind: 'QUANTITY',
  product: { id: SAVON.id, sku: SAVON.sku, name: SAVON.name },
  category: null,
  minQty: '24',
  customerCategory: null,
  customerType: null,
  pct: '10',
  startsOn: null,
  endsOn: null,
  isActive: true,
  updatedAt: '2026-10-09T08:00:00.000Z',
  ...over,
});
const SOAPS = SAVON.category!;
const SOAP_RULE = `${text.kinds.QUANTITY} 10 %`;

function mount(editable: boolean, handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi({
    'GET /categories': ok({ items: [SOAPS] }),
    'GET /customers/categories': ok({ categories: ['Régulier', 'Gros acheteur'] }),
    ...handlers,
  });
  render(
    <StatusLineProvider>
      <Frame workspace="owner" name={labels.workspaces.owner.title}>
        <DiscountRulesPanel editable={editable} />
      </Frame>
    </StatusLineProvider>,
  );
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const type = (name: string, value: string) =>
  fireEvent.change(panel().getByRole('textbox', { name }), { target: { value } });
const pick = (name: string, value: string) =>
  fireEvent.change(panel().getByRole('combobox', { name }), { target: { value } });

describe('DiscountRulesPanel — the owner’s discount rules (T-090, H62)', () => {
  it('adds a rule by quantity on one product, then lists it', async () => {
    const api = mount(true, {
      [LIST]: ok({ items: [] }),
      'GET /products/search?q=sav': ok(searchResult([SAVON])),
      [ADD]: { status: 201, body: rule() },
    });
    expect(await panel().findByText(text.none)).toBeInTheDocument();

    type(text.minQty, '24');
    type(text.pct, '10');
    pick(text.scope, 'PRODUCT');
    fireEvent.change(panel().getByRole('searchbox', { name: text.search }), {
      target: { value: 'sav' },
    });
    fireEvent.click(panel().getByRole('button', { name: text.searchGo }));
    fireEvent.click(await panel().findByRole('button', { name: text.pick(SAVON.sku, SAVON.name) }));
    fireEvent.click(panel().getByRole('button', { name: text.add }));

    await waitFor(() => expect(band().textContent).toBe(text.added(SOAP_RULE)));
    expect(api.callsTo(ADD)[0]?.body).toEqual({
      kind: 'QUANTITY',
      productId: SAVON.id,
      categoryId: null,
      minQty: '24',
      customerCategory: null,
      customerType: null,
      pct: '10',
      startsOn: null,
      endsOn: null,
      isActive: true,
    });
    const row = within(panel().getByRole('table', { name: text.title })).getAllByRole('row')[1];
    expect(row).toHaveTextContent(text.pick(SAVON.sku, SAVON.name));
    expect(row).toHaveTextContent(text.fromQty('24'));
    expect(row).toHaveTextContent(text.always);
    // A new form, empty again.
    expect(panel().getByRole('textbox', { name: text.pct })).toHaveValue('');
  });

  it('adds a promotion on a category, between two dates', async () => {
    const api = mount(true, {
      [LIST]: ok({ items: [] }),
      [ADD]: {
        status: 201,
        body: rule({
          kind: 'PROMOTION',
          product: null,
          category: SOAPS,
          minQty: null,
          pct: '8',
          startsOn: '2026-10-12',
          endsOn: '2026-10-18',
        }),
      },
    });
    await panel().findByText(text.none);
    pick(text.kind, 'PROMOTION');
    type(text.pct, '8');
    pick(text.scope, 'CATEGORY');
    fireEvent.change(panel().getByLabelText(text.from), { target: { value: '2026-10-12' } });
    fireEvent.change(panel().getByLabelText(text.to), { target: { value: '2026-10-18' } });
    fireEvent.click(panel().getByRole('button', { name: text.add }));

    await waitFor(() => expect(api.callsTo(ADD)).toHaveLength(1));
    expect(api.callsTo(ADD)[0]?.body).toMatchObject({
      kind: 'PROMOTION',
      productId: null,
      categoryId: SOAPS.id,
      minQty: null,
      pct: '8',
      startsOn: '2026-10-12',
      endsOn: '2026-10-18',
    });
    expect(await panel().findByText(text.between('12/10/2026', '18/10/2026'))).toBeInTheDocument();
  });

  it('refuses an incomplete rule without calling the API', async () => {
    const api = mount(true, { [LIST]: ok({ items: [] }) });
    await panel().findByText(text.none);
    type(text.pct, '10');
    fireEvent.click(panel().getByRole('button', { name: text.add }));

    expect(panel().getByRole('alert')).toHaveTextContent(text.invalid);
    expect(api.callsTo(ADD)).toHaveLength(0);
  });

  it('changes a rule, then switches it off', async () => {
    const api = mount(true, {
      [LIST]: ok({ items: [rule()] }),
      [CHANGE]: ok(rule({ pct: '12' })),
    });
    fireEvent.click(await panel().findByRole('button', { name: text.editOf(SOAP_RULE) }));
    expect(panel().getByRole('textbox', { name: text.pct })).toHaveValue('10');
    type(text.pct, '12');
    fireEvent.click(panel().getByRole('button', { name: text.save }));

    const changed = `${text.kinds.QUANTITY} 12 %`;
    await waitFor(() => expect(band().textContent).toBe(text.saved(changed)));
    expect(api.callsTo(CHANGE)[0]?.body).toMatchObject({ productId: SAVON.id, pct: '12' });
    expect(panel().getByRole('button', { name: text.add })).toBeInTheDocument();

    api.on(CHANGE, ok(rule({ pct: '12', isActive: false })));
    fireEvent.click(panel().getByRole('button', { name: text.switchOff }));
    await waitFor(() => expect(band().textContent).toBe(text.switchedOff(changed)));
    expect(api.callsTo(CHANGE)[1]?.body).toMatchObject({ pct: '12', isActive: false });
    expect(panel().getByRole('button', { name: text.switchOn })).toBeInTheDocument();
  });

  it('shows the manager the rules, without changing them', async () => {
    const api = mount(false, { [LIST]: ok({ items: [rule()] }) });
    expect(await panel().findByText(text.fromQty('24'))).toBeInTheDocument();
    expect(panel().getByText(text.introReadOnly)).toBeInTheDocument();
    expect(panel().queryByRole('button')).toBeNull();
    expect(api.callsTo('GET /categories')).toHaveLength(0);
  });
});
