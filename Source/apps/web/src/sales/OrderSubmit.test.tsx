import { computeQuote, ERROR_LABELS, formatMga, type Order, type Quote } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { quoteInput } from './discount-entry.js';
import { draftReducer, emptyDraft, saveSignature, type DraftState } from './draft.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { CUSTOMER, QUOTE_ID, RIZ, SAVON, savedQuote } from './test-hits.js';

const text = labels.sales.draft;
const [, PAQUET] = SAVON.units;
const [KG] = RIZ.units;
const NUMBER = 'D-2026-000042';
const SUBMIT = `POST /orders/${QUOTE_ID}/submit`;
/** Testing Library compares text with its spaces collapsed, non-breaking ones included. */
const shown = (value: string) => value.replace(/\s/g, ' ');

/** Two packs of soap and 3 kg of rice for Rasoa, the pad closed. */
const ready: DraftState = [
  { type: 'add', hit: SAVON, unitId: PAQUET!.id, qty: '2' },
  { type: 'add', hit: RIZ, unitId: KG!.id, qty: '3' },
  { type: 'select', key: null },
  { type: 'setCustomer', customer: CUSTOMER },
].reduce((state, action) => draftReducer(state, action as never), emptyDraft);

/** The quote as saved, its totals those of the screen unless a price changed. */
function quoteOf(draft: DraftState, version = 1, prices: Record<string, string> = {}): Quote {
  const quote = savedQuote(draft, NUMBER, version, prices);
  const repriced = {
    ...draft,
    lines: draft.lines.map((line) => ({
      ...line,
      unit: { ...line.unit, price: prices[line.unit.id] ?? line.unit.price },
    })),
  };
  return { ...quote, total: computeQuote(quoteInput(repriced)).total };
}

/** Saved under version 1 and unchanged since. */
const savedReady: DraftState = {
  ...ready,
  saved: { id: QUOTE_ID, number: NUMBER, version: 1, body: saveSignature(ready) },
};

function orderOf(quote: Quote): Order {
  return {
    ...quote,
    version: quote.version + 1,
    status: 'SUBMITTED',
    ticket: { letter: 'A', seq: 15, date: '2026-09-26' },
    submittedAt: '2026-09-26T08:00:00.000Z',
    expiresAt: '2026-09-26T20:59:00.000Z',
  };
}

function mount(handlers: Parameters<typeof fakeApi>[0], initialDraft: DraftState) {
  const api = fakeApi({
    'GET /categories': ok({ items: [] }),
    'GET /products/favorites': ok({ items: [] }),
    ...handlers,
  });
  render(
    <StatusLineProvider>
      <Frame workspace="sales" name={labels.workspaces.sales.title}>
        <SalesWorkspace initialDraft={initialDraft} discounts />
      </Frame>
    </StatusLineProvider>,
  );
  return api;
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const bandAlert = () => within(screen.getByRole('contentinfo')).getByRole('alert');
const submitButton = () => screen.getByRole('button', { name: text.submit });
const dialog = (name: string) => screen.getByRole('dialog', { name });

describe('quote screen: validating the order (T-032, RG-CMD-03/05)', () => {
  it('validates the saved quote and shows its ticket with the name, big', async () => {
    const api = mount({ [SUBMIT]: ok(orderOf(quoteOf(ready))) }, savedReady);
    fireEvent.click(submitButton());

    const sheet = await screen.findByRole('dialog', { name: labels.sales.order.title });
    expect(api.callsTo(SUBMIT)[0]!.body).toEqual({ version: 1 });
    expect(api.callsTo('POST /quotes')).toHaveLength(0);
    // RG-TKT-03: the ticket always with the customer's name.
    expect(within(sheet).getByText('A15')).toHaveClass('text-96');
    expect(within(sheet).getByText(CUSTOMER.name)).toBeVisible();
    expect(sheet).toHaveTextContent(labels.sales.order.number(NUMBER));
    expect(band()).toHaveTextContent(text.submitted('A15', CUSTOMER.name));

    fireEvent.click(within(sheet).getByRole('button', { name: labels.sales.order.newQuote }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(text.empty)).toBeVisible();
    expect(screen.getByText(text.unsaved)).toBeVisible();
  });

  it('saves what is on screen first, then validates the version saved', async () => {
    const quote = quoteOf(ready);
    const api = mount({ 'POST /quotes': ok(quote), [SUBMIT]: ok(orderOf(quote)) }, ready);
    fireEvent.click(submitButton());

    await screen.findByRole('dialog', { name: labels.sales.order.title });
    expect(api.calls.map((call) => `${call.method} ${call.path}`)).toEqual(
      expect.arrayContaining(['POST /quotes', SUBMIT]),
    );
    expect(api.callsTo(SUBMIT)[0]!.body).toEqual({ version: 1 });
  });

  it('stops when the save priced it differently: the customer checks first (H28)', async () => {
    const dearer = quoteOf(ready, 1, { [KG!.id]: '3400' });
    const api = mount({ 'POST /quotes': ok(dearer) }, ready);
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(bandAlert()).toHaveTextContent(shown(text.pricesUpdated(formatMga(dearer.total)))),
    );
    expect(api.callsTo(SUBMIT)).toHaveLength(0);
    expect(screen.getByText(text.savedAs(NUMBER))).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves again at the new price when a price changed after the save (H28)', async () => {
    const api = mount(
      {
        [SUBMIT]: apiError(409, 'ORDER_PRICE_CHANGED', { lines: [2] }),
        [`PUT /quotes/${QUOTE_ID}`]: ok(quoteOf(ready, 2, { [KG!.id]: '3400' })),
      },
      savedReady,
    );
    fireEvent.click(submitButton());

    await waitFor(() => expect(bandAlert()).toHaveTextContent(ERROR_LABELS.ORDER_PRICE_CHANGED));
    expect(bandAlert()).toHaveTextContent(text.linesConcerned('2'));
    expect(api.callsTo(`PUT /quotes/${QUOTE_ID}`)[0]!.body).toMatchObject({ version: 1 });
    // The screen shows the saved price, the quote saved and unchanged: ready to validate again.
    expect(screen.getAllByText(shown('3 400,00')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: text.openPdf })).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names what is short, and offers what the stock covers (RG-CMD-02)', async () => {
    mount(
      {
        [SUBMIT]: apiError(409, 'STOCK_UNAVAILABLE', {
          shortages: [
            {
              productId: SAVON.id,
              sku: SAVON.sku,
              name: SAVON.name,
              baseUnit: 'pièce',
              available: '9.00',
              requested: '12.00',
              lines: [1],
            },
          ],
        }),
      },
      savedReady,
    );
    fireEvent.click(submitButton());

    const sheet = await screen.findByRole('dialog', { name: labels.sales.stock.title });
    const counts = labels.sales.stock.counts('9', '12', 'pièce');
    expect(sheet).toHaveTextContent(counts);
    expect(bandAlert()).toHaveTextContent(`${SAVON.sku} : ${counts}`);
    // 9 pieces make 1,5 pack of 6.
    fireEvent.click(
      within(sheet).getByRole('button', { name: labels.sales.stock.fit(1, '1,5', 'paquet') }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: text.editQty(1, '1,5') })).toBeVisible();
    expect(screen.getByText(`${text.savedAs(NUMBER)}, ${text.changed}`)).toBeVisible();
  });

  it('never validates an order at 0,00 MGA: nothing is sent (H50)', () => {
    const soap = [
      { type: 'add', hit: SAVON, unitId: PAQUET!.id, qty: '2' },
      { type: 'select', key: null },
      { type: 'setCustomer', customer: CUSTOMER },
    ].reduce((state, action) => draftReducer(state, action as never), emptyDraft);
    // The owner's code gave the soap away, all of it: the only line.
    const free = draftReducer(soap, {
      type: 'codeAttached',
      quote: {
        ...savedQuote(soap, NUMBER, 2),
        discountCode: {
          code: 'R7K4-29QP',
          granted: false,
          items: [{ productId: SAVON.id, discount: { kind: 'pct', value: '100' } }],
        },
      },
      sent: soap,
    });
    expect(computeQuote(quoteInput(free)).total).toBe('0.00');
    const api = mount({}, free);
    fireEvent.click(submitButton());

    expect(bandAlert()).toHaveTextContent(shown(ERROR_LABELS.ORDER_TOTAL_ZERO));
    expect(
      api.calls.filter((call) => call.method !== 'GET' && call.path !== '/suggested-discounts'),
    ).toHaveLength(0);
  });

  it('asks for the customer before anything is sent', () => {
    const api = mount({}, { ...ready, customer: null });
    fireEvent.click(submitButton());
    expect(bandAlert()).toHaveTextContent(text.customerFirstOrder);
    expect(
      api.calls.filter((call) => call.method !== 'GET' && call.path !== '/suggested-discounts'),
    ).toHaveLength(0);
  });

  it('shows the dialog of a shortage kept in the draft, and closes it', () => {
    mount(
      {},
      {
        ...savedReady,
        shortagesOpen: true,
        shortages: [
          {
            productId: RIZ.id,
            sku: RIZ.sku,
            name: RIZ.name,
            baseUnit: 'kg',
            available: '0.00',
            requested: '3.00',
            lines: [2],
          },
        ],
      },
    );
    const sheet = dialog(labels.sales.stock.title);
    // Nothing left: the line can only go.
    expect(within(sheet).getByRole('button', { name: labels.sales.stock.drop(2) })).toBeVisible();
    fireEvent.click(within(sheet).getByRole('button', { name: labels.sales.stock.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
