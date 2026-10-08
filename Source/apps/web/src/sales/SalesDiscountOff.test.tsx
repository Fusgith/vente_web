import type { OrderSummary } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { draftReducer, emptyDraft, type DraftState } from './draft.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { CUSTOMER, QUOTE_ID, SAVON, savedQuote, searchResult } from './test-hits.js';

const text = labels.sales.draft;
const NUMBER = 'D-2026-000042';
const PAQUET = SAVON.units[1]!;

/** Two packs of soap for Rasoa, the pad closed. */
const ready: DraftState = [
  { type: 'add', hit: SAVON, unitId: PAQUET.id, qty: '2' },
  { type: 'select', key: null },
  { type: 'setCustomer', customer: CUSTOMER },
].reduce((state, action) => draftReducer(state, action as never), emptyDraft);

/** The same quote as saved while discounts were allowed: 500 MGA off the line, 1 000 off the total. */
const discounted = (() => {
  const quote = savedQuote(ready, NUMBER);
  const [line] = quote.lines;
  return {
    ...quote,
    lines: [
      {
        ...line!,
        gross: '9000.00',
        discountAmount: '500.00',
        discountSource: 'WITHIN_CAP' as const,
      },
    ],
    subtotal: '8500.00',
    orderDiscount: '1000.00',
  };
})();

const ROW: OrderSummary = {
  id: QUOTE_ID,
  number: NUMBER,
  version: 1,
  customer: CUSTOMER,
  salesUser: { id: '0192a4f0-0000-7000-8000-000000000501', fullName: 'Vola Commerciale' },
  total: '7500.00',
  status: 'DRAFT',
  ticket: null,
  updatedAt: '2026-10-04T07:00:00.000Z',
  outdated: false,
};

function mount(enabled: boolean, handlers: Parameters<typeof fakeApi>[0] = {}, draft = ready) {
  const api = fakeApi({
    'GET /sales-discount': ok({ enabled }),
    'GET /categories': ok({ items: [] }),
    'GET /products/favorites': ok({ items: [] }),
    ...handlers,
  });
  render(
    <StatusLineProvider>
      <Frame workspace="sales" name={labels.workspaces.sales.title}>
        <SalesWorkspace initialDraft={draft} />
      </Frame>
    </StatusLineProvider>,
  );
  return api;
}

const discountHead = () => screen.queryByRole('columnheader', { name: /^Remise/ });
const orderDiscount = () => screen.queryByRole('button', { name: labels.sales.discount.order });
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('the salesperson’s tablet when the admin allows no discount (T-087, H60)', () => {
  it('shows the discounts once the setting reads allowed', async () => {
    mount(true);
    expect(await screen.findByRole('columnheader', { name: /^Remise/ })).toBeInTheDocument();
    expect(orderDiscount()).toBeInTheDocument();
  });

  it('shows no discount column, no total discount, no discount on the pad', async () => {
    const api = mount(false);
    await waitFor(() => expect(api.callsTo('GET /sales-discount')).toHaveLength(1));
    expect(discountHead()).toBeNull();
    expect(orderDiscount()).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: text.editQty(1, '2') }));
    const pad = screen.getByRole('region', { name: labels.sales.pad.title(1) });
    expect(within(pad).queryByText(labels.sales.discount.inPct)).toBeNull();
    fireEvent.click(within(pad).getByRole('button', { name: '3' }));
    fireEvent.click(within(pad).getByRole('button', { name: labels.sales.pad.confirm }));
    expect(await screen.findByRole('button', { name: text.editQty(1, '3') })).toBeInTheDocument();
  });

  it('takes a discounted quote up without its discounts, and saves it so', async () => {
    const api = mount(
      false,
      {
        'GET /quotes': ok({ orders: [ROW] }),
        [`GET /quotes/${QUOTE_ID}`]: ok(discounted),
        'GET /products/search?q=SAV-001': ok(searchResult([SAVON])),
        [`PUT /quotes/${QUOTE_ID}`]: ok(savedQuote(ready, NUMBER, 2)),
      },
      emptyDraft,
    );
    fireEvent.click(screen.getByRole('button', { name: labels.mine.open }));
    fireEvent.click(await screen.findByRole('button', { name: labels.mine.takeUpOf(NUMBER) }));

    await waitFor(() =>
      expect(band()).toHaveTextContent(labels.salesDiscount.removed(NUMBER).replace(/\s/g, ' ')),
    );
    fireEvent.click(screen.getByRole('button', { name: text.saveChanges }));
    await waitFor(() => expect(api.callsTo(`PUT /quotes/${QUOTE_ID}`)).toHaveLength(1));
    expect(api.callsTo(`PUT /quotes/${QUOTE_ID}`)[0]!.body).toMatchObject({
      lines: [{ productUnitId: PAQUET.id, qty: '2', discount: null }],
      orderDiscount: null,
    });
  });
});
