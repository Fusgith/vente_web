import { ERROR_LABELS, type Order, type Quote } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { REASONS, REQUEST_ID, requestOf } from '../test/requests.js';
import {
  draftReducer,
  emptyDraft,
  saveSignature,
  unsavedChanges,
  type DraftState,
} from './draft.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { CUSTOMER, QUOTE_ID, RIZ, SAVON, savedQuote } from './test-hits.js';

const text = labels.requests;
const [, PAQUET] = SAVON.units;
const [KG] = RIZ.units;
const NUMBER = 'D-2026-000042';
const CREATE = 'POST /discount-requests';
const WITHDRAW = `POST /discount-requests/${REQUEST_ID}/withdraw`;
const READ = `GET /quotes/${QUOTE_ID}`;

/** Two packs of soap and 3 kg of rice for Rasoa, the pad closed. */
const ready: DraftState = [
  { type: 'add', hit: SAVON, unitId: PAQUET!.id, qty: '2' },
  { type: 'add', hit: RIZ, unitId: KG!.id, qty: '3' },
  { type: 'select', key: null },
  { type: 'setCustomer', customer: CUSTOMER },
].reduce((state, action) => draftReducer(state, action as never), emptyDraft);

const savedReady: DraftState = {
  ...ready,
  saved: { id: QUOTE_ID, number: NUMBER, version: 1, body: saveSignature(ready) },
};

/** The quote as saved, its request to the owner as given (none by default). */
function quoteWith(version: number, request: Quote['discountRequest'] = null): Quote {
  return { ...savedQuote(ready, NUMBER, version), discountRequest: request };
}

/** The quote as the request routes give it back: an order still a quote (DRAFT). */
const asOrder = (quote: Quote): Order => ({
  ...quote,
  status: 'DRAFT',
  ticket: null,
  submittedAt: null,
  expiresAt: null,
});

/** Granted: 12 % on the soap packs as a code, applied to the quote at once (H53). */
function grantedQuote(): Quote {
  const quote = quoteWith(3);
  return {
    ...quote,
    lines: quote.lines.map((line) =>
      line.productId === SAVON.id
        ? { ...line, discountPct: '12.00', discountAmount: '2040.00', discountSource: 'CODE' }
        : line,
    ),
    discountCode: {
      code: 'R7K4-29QP',
      items: [{ productId: SAVON.id, discount: { kind: 'pct', value: '12' } }],
    },
    discountRequest: requestOf(SAVON, {
      status: 'GRANTED',
      closedAt: '2026-10-03T07:05:00.000Z',
    }),
  };
}

function mount(handlers: Parameters<typeof fakeApi>[0], initialDraft: DraftState) {
  const api = fakeApi({
    'GET /categories': ok({ items: [] }),
    'GET /products/favorites': ok({ items: [] }),
    'GET /discount-requests/reasons': ok({ reasons: REASONS }),
    ...handlers,
  });
  render(
    <RealtimeProvider me={meFor({ user: RIJA, activeRole: 'sales' })}>
      <StatusLineProvider>
        <Frame workspace="sales" name={labels.workspaces.sales.title}>
          <SalesWorkspace initialDraft={initialDraft} />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  return api;
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

/** Opens the sheet and waits for the reasons; the sheet is returned. */
async function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: text.ask }));
  const sheet = screen.getByRole('dialog', { name: text.title });
  await waitFor(() => expect(within(sheet).getByLabelText(text.reason)).toBeEnabled());
  return sheet;
}

/** 12 % on the soap, 5 000 MGA off the total, a reason and a note: sent. */
async function askTwelvePercent() {
  const sheet = await openSheet();
  fireEvent.change(within(sheet).getByLabelText(text.wantedOf(SAVON.name)), {
    target: { value: '12' },
  });
  fireEvent.change(within(sheet).getByLabelText(text.wantedOf(text.totalWhat)), {
    target: { value: '5 000' },
  });
  fireEvent.change(within(sheet).getByLabelText(labels.codes.kindOf(text.totalWhat)), {
    target: { value: 'amount' },
  });
  fireEvent.change(within(sheet).getByLabelText(text.reason), { target: { value: REASONS[1] } });
  fireEvent.change(within(sheet).getByLabelText(text.note), {
    target: { value: '  Commande pour une fête  ' },
  });
  fireEvent.click(within(sheet).getByRole('button', { name: text.send }));
  return sheet;
}

async function listening(event: string) {
  await waitFor(() =>
    expect(fakeRealtime.sockets[0]?.listeners.get(event)?.size).toBeGreaterThan(0),
  );
}

describe('quote screen: a discount asked of the owner (T-033b, RG-REM-03, H51, H52)', () => {
  it('sends the request and shows it waiting, the customer fixed', async () => {
    const api = mount({ [CREATE]: ok(asOrder(quoteWith(2, requestOf(SAVON)))) }, savedReady);
    await askTwelvePercent();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.callsTo(CREATE)[0]!.body).toEqual({
      orderId: QUOTE_ID,
      version: 1,
      items: [
        { productId: SAVON.id, discount: { kind: 'pct', value: '12' } },
        { productId: null, discount: { kind: 'amount', value: '5000' } },
      ],
      reason: REASONS[1],
      note: 'Commande pour une fête',
    });
    expect(band()).toHaveTextContent(text.sent);
    // While it waits: its mark and the withdrawal take the buttons' place (H52).
    // The closing dialog hands focus back first: on a slow machine the mark takes it a frame later.
    await waitFor(() => expect(screen.getByText(text.pending)).toHaveFocus());
    expect(screen.getByRole('button', { name: text.withdraw })).toBeEnabled();
    expect(screen.queryByRole('button', { name: text.ask })).toBeNull();
    expect(screen.queryByRole('button', { name: labels.sales.code.open })).toBeNull();
    expect(screen.getByRole('button', { name: text.customerLocked(CUSTOMER.name) })).toBeDisabled();
  });

  it('asks for something to grant, then for the reason, before anything is sent', async () => {
    const api = mount({}, savedReady);
    const sheet = await openSheet();

    fireEvent.click(within(sheet).getByRole('button', { name: text.send }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(text.nothingAsked);

    fireEvent.change(within(sheet).getByLabelText(text.wantedOf(SAVON.name)), {
      target: { value: '120' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: text.send }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(text.invalid);

    fireEvent.change(within(sheet).getByLabelText(text.wantedOf(SAVON.name)), {
      target: { value: '12' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: text.send }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(text.reasonFirst);
    expect(api.callsTo(CREATE)).toHaveLength(0);
  });

  it('says the reasons unread, then reads them again on demand', async () => {
    let reads = 0;
    mount(
      {
        'GET /discount-requests/reasons': () =>
          reads++ === 0 ? apiError(503, 'SERVICE_UNAVAILABLE') : ok({ reasons: REASONS }),
      },
      savedReady,
    );
    fireEvent.click(screen.getByRole('button', { name: text.ask }));
    const sheet = screen.getByRole('dialog', { name: text.title });
    const reason = within(sheet).getByLabelText(text.reason);

    const unread = await within(sheet).findByRole('alert');
    expect(reason).toBeDisabled();
    expect(reason).toHaveAccessibleDescription(unread.textContent!);
    fireEvent.click(within(sheet).getByRole('button', { name: labels.retry }));

    await waitFor(() => expect(reason).toBeEnabled());
    expect(within(sheet).queryByRole('alert')).toBeNull();
    expect(within(sheet).getByRole('option', { name: REASONS[0]! })).toBeInTheDocument();
  });

  it('saves a new quote first, then asks on the version saved', async () => {
    const api = mount(
      {
        'POST /quotes': ok(quoteWith(1)),
        [CREATE]: ok(asOrder(quoteWith(2, requestOf(SAVON)))),
      },
      ready,
    );
    await askTwelvePercent();

    await waitFor(() => expect(screen.getByText(text.pending)).toBeVisible());
    expect(api.callsTo('POST /quotes')).toHaveLength(1);
    expect(api.callsTo(CREATE)[0]!.body).toMatchObject({ orderId: QUOTE_ID, version: 1 });
  });

  it('finds the request waiting when its answer was lost on the Wi-Fi', async () => {
    const api = mount(
      { [CREATE]: 'network', [READ]: ok(quoteWith(2, requestOf(SAVON))) },
      savedReady,
    );
    await askTwelvePercent();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.callsTo(READ)).toHaveLength(1);
    expect(band()).toHaveTextContent(text.sent);
    expect(screen.getByText(text.pending)).toBeVisible();
  });

  it('keeps the sheet open on a refusal, the reason shown', async () => {
    mount(
      {
        [CREATE]: apiError(409, 'QUOTE_HAS_CODE'),
        [READ]: ok(quoteWith(1)),
      },
      savedReady,
    );
    const sheet = await askTwelvePercent();

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(ERROR_LABELS.QUOTE_HAS_CODE);
    expect(screen.queryByText(text.pending)).toBeNull();
  });

  it('withdraws the request agreed with the customer (H52)', async () => {
    const waiting: DraftState = {
      ...savedReady,
      saved: { ...savedReady.saved!, version: 2 },
      request: requestOf(SAVON),
    };
    const api = mount(
      {
        [WITHDRAW]: ok(
          asOrder(
            quoteWith(
              2,
              requestOf(SAVON, { status: 'WITHDRAWN', closedAt: '2026-10-03T07:05:00.000Z' }),
            ),
          ),
        ),
      },
      waiting,
    );

    fireEvent.click(screen.getByRole('button', { name: text.withdraw }));

    await waitFor(() => expect(band()).toHaveTextContent(text.withdrawn));
    expect(api.callsTo(WITHDRAW)).toHaveLength(1);
    expect(screen.queryByText(text.pending)).toBeNull();
    expect(screen.getByRole('button', { name: text.ask })).toBeEnabled();
    expect(screen.getByRole('button', { name: labels.sales.code.open })).toBeEnabled();
  });
});

describe('quote screen: the owner’s answer (T-033b, H53, H54)', () => {
  const waiting: DraftState = {
    ...savedReady,
    saved: { ...savedReady.saved!, version: 2 },
    request: requestOf(SAVON),
  };

  it('applies the code granted as soon as the owner answers', async () => {
    const api = mount({ [READ]: ok(grantedQuote()) }, waiting);
    await listening('discount.request_decided');

    act(() =>
      fakeRealtime.emit('discount.request_decided', {
        requestId: REQUEST_ID,
        orderId: QUOTE_ID,
        status: 'GRANTED',
      }),
    );

    await waitFor(() => expect(band()).toHaveTextContent(text.decided.GRANTED('R7K4-29QP')));
    expect(api.callsTo(READ)).toHaveLength(1);
    expect(screen.getByText(labels.sales.code.tag('R7K4-29QP'))).toBeVisible();
    expect(screen.queryByText(text.pending)).toBeNull();
    // The screen matches the quote as saved: nothing left to save.
    expect(screen.getByRole('link', { name: labels.sales.draft.openPdf })).toBeVisible();
  });

  it('keeps a total discount typed meanwhile, the code on the lines it covers', () => {
    const typed = draftReducer(waiting, {
      type: 'setOrderDiscount',
      discount: { kind: 'pct', value: '5' },
    });

    const next = draftReducer(typed, { type: 'requestChanged', quote: grantedQuote() });

    expect(next.code?.code).toBe('R7K4-29QP');
    expect(next.lines.find((line) => line.product.id === SAVON.id)?.discount).toEqual({
      kind: 'pct',
      value: '12',
    });
    expect(next.orderDiscount).toEqual({ kind: 'pct', value: '5' });
    // Checked again with the code at the next save.
    expect(unsavedChanges(next)).toBe(true);
  });

  it('says the owner refused, the buttons back', async () => {
    mount(
      {
        [READ]: ok(
          quoteWith(
            2,
            requestOf(SAVON, { status: 'REJECTED', closedAt: '2026-10-03T07:05:00.000Z' }),
          ),
        ),
      },
      waiting,
    );
    await listening('discount.request_decided');

    act(() =>
      fakeRealtime.emit('discount.request_decided', {
        requestId: REQUEST_ID,
        orderId: QUOTE_ID,
        status: 'REJECTED',
      }),
    );

    await waitFor(() => expect(band()).toHaveTextContent(text.decided.REJECTED));
    expect(screen.queryByText(text.pending)).toBeNull();
    expect(screen.getByRole('button', { name: text.ask })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: labels.sales.customer.change(CUSTOMER.name) }),
    ).toBeEnabled();
  });

  it('ignores the answer about another quote', async () => {
    const api = mount({}, waiting);
    await listening('discount.request_decided');

    act(() =>
      fakeRealtime.emit('discount.request_decided', {
        requestId: REQUEST_ID,
        orderId: '0192a4f0-0000-7000-8000-000000000499',
        status: 'GRANTED',
      }),
    );

    expect(api.callsTo(READ)).toHaveLength(0);
    expect(screen.getByText(text.pending)).toBeVisible();
  });
});
