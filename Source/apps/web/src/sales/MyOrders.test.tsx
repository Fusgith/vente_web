import { ticketLabel, type Order, type OrderSummary } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { draftReducer, emptyDraft, type DraftState } from './draft.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { CUSTOMER, QUOTE_ID, RIZ, SAVON, savedQuote, searchResult } from './test-hits.js';

const text = labels.mine;
const NUMBER = 'D-2026-000042';
const QUEUED_ID = '0192a4f0-0000-7000-8000-000000000402';
const EXPIRED_ID = '0192a4f0-0000-7000-8000-000000000403';
const TICKET = { letter: 'A', seq: 15, date: '2026-10-04' };

/** Two packs of soap and 3 kg of rice for Rasoa, never saved. */
const ready: DraftState = [
  { type: 'add', hit: SAVON, unitId: SAVON.units[1]!.id, qty: '2' },
  { type: 'add', hit: RIZ, unitId: RIZ.units[0]!.id, qty: '3' },
  { type: 'select', key: null },
  { type: 'setCustomer', customer: CUSTOMER },
].reduce((state, action) => draftReducer(state, action as never), emptyDraft);

function row(id: string, number: string, status: OrderSummary['status']): OrderSummary {
  return {
    id,
    number,
    version: 3,
    customer: CUSTOMER,
    salesUser: { id: '0192a4f0-0000-7000-8000-000000000501', fullName: 'Vola Commerciale' },
    total: '12500.00',
    status,
    ticket: status === 'DRAFT' ? null : TICKET,
    updatedAt: '2026-10-04T07:00:00.000Z',
    outdated: false,
  };
}

/** The order as the API returns it after the action. */
function orderOf(number: string, status: Order['status']): Order {
  return {
    ...savedQuote(ready, number),
    version: 4,
    status,
    ticket: TICKET,
    submittedAt: '2026-10-04T08:00:00.000Z',
    expiresAt: '2026-10-04T20:59:00.000Z',
  };
}

const ROWS = [
  row(QUOTE_ID, NUMBER, 'DRAFT'),
  row(QUEUED_ID, 'D-2026-000043', 'SUBMITTED'),
  row(EXPIRED_ID, 'D-2026-000044', 'EXPIRED'),
];

function mount(handlers: Parameters<typeof fakeApi>[0], initialDraft: DraftState = emptyDraft) {
  const api = fakeApi({
    'GET /categories': ok({ items: [] }),
    'GET /products/favorites': ok({ items: [] }),
    'GET /quotes': ok({ orders: ROWS }),
    ...handlers,
  });
  render(
    <StatusLineProvider>
      <Frame workspace="sales" name={labels.workspaces.sales.title}>
        <SalesWorkspace initialDraft={initialDraft} />
      </Frame>
    </StatusLineProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: text.open }));
  return api;
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const bandAlert = () => within(screen.getByRole('contentinfo')).getByRole('alert');

describe('the salesperson’s quotes and orders (T-035b)', () => {
  it('lists them and takes a saved quote up again, its lines read from the catalogue', async () => {
    const api = mount({
      [`GET /quotes/${QUOTE_ID}`]: ok(savedQuote(ready, NUMBER)),
      'GET /products/search?q=SAV-001': ok(searchResult([SAVON])),
      'GET /products/search?q=RIZ-001': ok(searchResult([RIZ])),
    });
    const list = await screen.findByRole('table', { name: text.list });
    expect(within(list).getByText(text.status.SUBMITTED)).toBeInTheDocument();
    expect(within(list).getByText(text.status.EXPIRED)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: text.takeUpOf(NUMBER) }));

    await waitFor(() => expect(band()).toHaveTextContent(text.takenUp(NUMBER)));
    expect(screen.queryByRole('dialog', { name: text.title })).not.toBeInTheDocument();
    expect(screen.getByText(SAVON.name)).toBeInTheDocument();
    expect(screen.getByText(RIZ.name)).toBeInTheDocument();
    expect(api.callsTo(`GET /quotes/${QUOTE_ID}`)).toHaveLength(1);
  });

  it('asks before replacing a screen with changes not saved', async () => {
    const api = mount({}, ready);
    fireEvent.click(await screen.findByRole('button', { name: text.takeUpOf(NUMBER) }));

    expect(await screen.findByText(text.replaceTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: text.keep }));

    expect(screen.queryByText(text.replaceTitle)).not.toBeInTheDocument();
    expect(api.callsTo(`GET /quotes/${QUOTE_ID}`)).toHaveLength(0);
  });

  it('cancels an order with its reason', async () => {
    const api = mount({
      [`POST /orders/${QUEUED_ID}/cancel`]: ok(orderOf('D-2026-000043', 'CANCELLED')),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.cancelOf('D-2026-000043') }));
    const sheet = screen.getByRole('dialog', {
      name: labels.register.cancelTitle(ticketLabel(TICKET), CUSTOMER.name),
    });
    fireEvent.change(within(sheet).getByLabelText(labels.register.cancelReason), {
      target: { value: 'Le client a changé d’avis' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: labels.register.cancelOrder }));

    await waitFor(() =>
      expect(band()).toHaveTextContent(
        labels.register.cancelled(ticketLabel(TICKET), CUSTOMER.name),
      ),
    );
    expect(api.callsTo(`POST /orders/${QUEUED_ID}/cancel`)[0]?.body).toEqual({
      version: 3,
      reason: 'Le client a changé d’avis',
    });
  });

  it('reactivates an expired order', async () => {
    const order = orderOf('D-2026-000044', 'SUBMITTED');
    const api = mount({ [`POST /orders/${EXPIRED_ID}/reactivate`]: ok(order) });
    fireEvent.click(
      await screen.findByRole('button', { name: text.reactivateOf('D-2026-000044') }),
    );

    await waitFor(() =>
      expect(band()).toHaveTextContent(text.reactivated(ticketLabel(TICKET), CUSTOMER.name)),
    );
    expect(api.callsTo(`POST /orders/${EXPIRED_ID}/reactivate`)[0]?.body).toEqual({ version: 3 });
  });

  it('says the order is a quote again when its reactivation is refused (H56)', async () => {
    mount({ [`POST /orders/${EXPIRED_ID}/reactivate`]: apiError(409, 'STOCK_UNAVAILABLE') });
    fireEvent.click(
      await screen.findByRole('button', { name: text.reactivateOf('D-2026-000044') }),
    );

    await waitFor(() => expect(bandAlert()).toHaveTextContent(text.becameQuote('D-2026-000044')));
  });
});
