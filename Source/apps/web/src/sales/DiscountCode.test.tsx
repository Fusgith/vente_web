import { ERROR_LABELS, formatMga, type Quote } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, ok, type FakeResponse } from '../test/fake-api.js';
import { draftReducer, emptyDraft, saveSignature, type DraftState } from './draft.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { CUSTOMER, QUOTE_ID, RIZ, SAVON, savedQuote } from './test-hits.js';

const text = labels.sales.code;
const [, PAQUET] = SAVON.units;
const [KG] = RIZ.units;
const NUMBER = 'D-2026-000042';
const ATTACH = `POST /quotes/${QUOTE_ID}/discount-code`;
const READ = `GET /quotes/${QUOTE_ID}`;
const SAVE = `PUT /quotes/${QUOTE_ID}`;
/** The band's text, its non-breaking spaces as plain ones. */
const shown = (value: string) => value.replace(/\s/g, ' ');

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

/** The quote once the code is attached: 1 700 MGA off the soap packs (10 %, beyond the 5 % cap). */
function attachedQuote(version: number): Quote {
  const quote = savedQuote(ready, NUMBER, version);
  return {
    ...quote,
    lines: quote.lines.map((line) =>
      line.productId === SAVON.id
        ? {
            ...line,
            discountPct: '10.00',
            discountAmount: '1700.00',
            discountSource: 'CODE' as const,
          }
        : line,
    ),
    discountCode: {
      code: 'R7K4-29QP',
      items: [{ productId: SAVON.id, discount: { kind: 'amount', value: '1700.00' } }],
    },
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
        <SalesWorkspace initialDraft={initialDraft} />
      </Frame>
    </StatusLineProvider>,
  );
  return api;
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const bandAlert = () => within(screen.getByRole('contentinfo')).getByRole('alert');

/** Opens the sheet, types the code and applies it; returns the sheet. */
function typeCode(code: string) {
  fireEvent.click(screen.getByRole('button', { name: text.open }));
  const sheet = screen.getByRole('dialog', { name: text.title });
  fireEvent.change(within(sheet).getByLabelText(text.field), { target: { value: code } });
  fireEvent.click(within(sheet).getByRole('button', { name: text.apply }));
  return sheet;
}

describe('quote screen: the owner’s code (T-034b, RG-REM-04, H42)', () => {
  it('attaches the code to the saved quote and shows what it grants', async () => {
    const api = mount({ [ATTACH]: ok(attachedQuote(2)) }, savedReady);
    typeCode('r7k4 29qp');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.callsTo(ATTACH)[0]!.body).toEqual({ code: 'r7k4 29qp', version: 1 });
    expect(band()).toHaveTextContent(text.attached('R7K4-29QP'));
    // One code per quote, for good: its tag takes the button's place.
    expect(screen.getByText(text.tag('R7K4-29QP'))).toBeVisible();
    expect(screen.queryByRole('button', { name: text.open })).toBeNull();
    expect(screen.getByText(text.onLine)).toBeInTheDocument();
    // The customer no longer changes (H42); the screen matches the quote as saved.
    expect(screen.getByRole('button', { name: text.customerLocked(CUSTOMER.name) })).toBeDisabled();
    expect(screen.getByRole('link', { name: labels.sales.draft.openPdf })).toBeVisible();
    // The button gone, the focus lands on the tag that replaced it.
    expect(screen.getByText(text.tag('R7K4-29QP'))).toHaveFocus();
  });

  it('finds the code on when its answer was lost on the Wi-Fi', async () => {
    const api = mount({ [ATTACH]: 'network', [READ]: ok(attachedQuote(2)) }, savedReady);
    typeCode('R7K4-29QP');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.callsTo(READ)).toHaveLength(1);
    expect(band()).toHaveTextContent(text.attached('R7K4-29QP'));
    expect(screen.getByText(text.tag('R7K4-29QP'))).toBeVisible();
  });

  it('says the network is down when the quote read again has no code', async () => {
    mount({ [ATTACH]: 'network', [READ]: ok(savedQuote(ready, NUMBER, 1)) }, savedReady);
    const sheet = typeCode('R7K4-29QP');

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(labels.errors.NETWORK_ERROR);
    expect(screen.queryByText(text.tag('R7K4-29QP'))).toBeNull();
  });

  it('saves the quote at a price changed since, the code left to apply once checked', async () => {
    const api = mount(
      {
        [ATTACH]: apiError(409, 'ORDER_PRICE_CHANGED', { lines: [2] }),
        [SAVE]: ok(savedQuote(ready, NUMBER, 2, { [KG!.id]: '3400' })),
      },
      savedReady,
    );
    const sheet = typeCode('R7K4-29QP');

    const alert = await within(sheet).findByRole('alert');
    expect(alert).toHaveTextContent(text.priceChanged);
    expect(alert).toHaveTextContent(labels.sales.draft.linesConcerned('2'));
    expect(api.callsTo(SAVE)[0]!.body).toMatchObject({ version: 1 });
    expect(screen.queryByText(text.tag('R7K4-29QP'))).toBeNull();
  });

  it('asks for a discount beyond its cap to come down before anything is sent', async () => {
    const beyond = draftReducer(ready, {
      type: 'setDiscount',
      key: ready.lines[0]!.key,
      discount: { kind: 'pct', value: '10' },
    });
    const api = mount({}, beyond);
    const sheet = typeCode('R7K4-29QP');

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(text.beyondCap);
    expect(api.calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });

  it('says so when the total’s discount comes down to the headroom the grants leave', async () => {
    const discounted = draftReducer(ready, {
      type: 'setOrderDiscount',
      discount: { kind: 'pct', value: '2' },
    });
    const saved: DraftState = {
      ...discounted,
      saved: { id: QUOTE_ID, number: NUMBER, version: 1, body: saveSignature(discounted) },
    };
    // 2 % of 24 900 would be 498: the API left 300.
    const lowered = { ...attachedQuote(2), subtotal: '24900.00', orderDiscount: '300.00' };
    mount({ [ATTACH]: ok(lowered) }, saved);
    typeCode('R7K4-29QP');

    await waitFor(() =>
      expect(band()).toHaveTextContent(
        shown(text.attachedLowered('R7K4-29QP', formatMga('300.00'))),
      ),
    );
  });

  it('tells a refusal arriving after the sheet was closed in the band', async () => {
    let answer: (response: FakeResponse) => void = () => undefined;
    mount(
      { [ATTACH]: () => new Promise<FakeResponse>((resolve) => (answer = resolve)) },
      savedReady,
    );
    const sheet = typeCode('R7K4-29QP');
    fireEvent.click(within(sheet).getByRole('button', { name: text.close }));
    expect(screen.queryByRole('dialog')).toBeNull();

    answer(apiError(409, 'DISCOUNT_CODE_NOT_ACTIVE'));
    await waitFor(() =>
      expect(bandAlert()).toHaveTextContent(ERROR_LABELS.DISCOUNT_CODE_NOT_ACTIVE),
    );
  });

  it('saves the screen first, then attaches the code to the version saved', async () => {
    const api = mount(
      {
        'POST /quotes': ok(savedQuote(ready, NUMBER, 1)),
        [ATTACH]: ok(attachedQuote(2)),
      },
      ready,
    );
    typeCode('R7K4-29QP');

    await waitFor(() => expect(screen.getByText(text.tag('R7K4-29QP'))).toBeVisible());
    expect(api.callsTo('POST /quotes')).toHaveLength(1);
    expect(api.callsTo(ATTACH)[0]!.body).toEqual({ code: 'R7K4-29QP', version: 1 });
  });

  it('keeps the sheet open on a refusal, saying why under the field', async () => {
    mount({ [ATTACH]: apiError(409, 'DISCOUNT_CODE_NOT_ACTIVE') }, savedReady);
    const sheet = typeCode('R7K4-29QP');

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.DISCOUNT_CODE_NOT_ACTIVE,
    );
    expect(within(sheet).getByLabelText(text.field)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(text.tag('R7K4-29QP'))).toBeNull();
    // Typing again clears the refusal.
    fireEvent.change(within(sheet).getByLabelText(text.field), { target: { value: 'R7K4' } });
    expect(within(sheet).queryByRole('alert')).toBeNull();
  });

  it('asks for the customer before anything is sent', async () => {
    const api = mount({}, { ...ready, customer: null });
    const sheet = typeCode('R7K4-29QP');

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(text.customerFirst);
    expect(api.calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });

  it('applies nothing while the field is empty', () => {
    mount({}, savedReady);
    fireEvent.click(screen.getByRole('button', { name: text.open }));
    const sheet = screen.getByRole('dialog', { name: text.title });
    expect(within(sheet).getByRole('button', { name: text.apply })).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText(text.field), { target: { value: ' - ' } });
    expect(within(sheet).getByRole('button', { name: text.apply })).toBeDisabled();
  });
});
