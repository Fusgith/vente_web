import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { draftReducer, emptyDraft, type DraftState } from './draft.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { CUSTOMER, RIZ, SAVON, savedQuote } from './test-hits.js';

const text = labels.register;
const [, PAQUET] = SAVON.units;
const [KG] = RIZ.units;

/** Two packs of soap (cap 5 %) and 3 kg of rice for Rasoa, the pad closed. */
const ready: DraftState = [
  { type: 'add', hit: SAVON, unitId: PAQUET!.id, qty: '2' },
  { type: 'add', hit: RIZ, unitId: KG!.id, qty: '3' },
  { type: 'select', key: null },
  { type: 'setCustomer', customer: CUSTOMER },
].reduce((state, action) => draftReducer(state, action as never), emptyDraft);

describe('quote screen: the owner’s planned discounts (T-090b, H62)', () => {
  it('shows a line’s planned discount, applies it in one tap, beyond the cap', async () => {
    const api = fakeApi({
      'GET /categories': ok({ items: [] }),
      'GET /products/favorites': ok({ items: [] }),
      'POST /suggested-discounts': ok({ lines: ['10', null] }),
      'POST /quotes': ok(savedQuote(ready, 'D-2026-000042', 1)),
    });
    render(
      <StatusLineProvider>
        <Frame workspace="sales" name={labels.workspaces.sales.title}>
          <SalesWorkspace initialDraft={ready} discounts />
        </Frame>
      </StatusLineProvider>,
    );

    expect(await screen.findByText(text.suggestedPct('10'))).toBeVisible();
    expect(api.callsTo('POST /suggested-discounts')[0]?.body).toEqual({
      customerId: CUSTOMER.id,
      lines: [
        { productUnitId: PAQUET!.id, qty: '2' },
        { productUnitId: KG!.id, qty: '3' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: text.applySuggested }));

    expect(within(screen.getByRole('contentinfo')).getByRole('status')).toHaveTextContent(
      text.suggestedApplied(1),
    );
    expect(screen.queryByText(text.suggestedPct('10'))).toBeNull();
    // 10 % beyond the 5 % cap: the rule widens the limit, the quote is sent.
    fireEvent.click(screen.getByRole('button', { name: labels.sales.draft.save }));
    await waitFor(() => expect(api.callsTo('POST /quotes')).toHaveLength(1));
    expect(api.callsTo('POST /quotes')[0]?.body).toMatchObject({
      lines: [{ discount: { kind: 'pct', value: '10' } }, { discount: null }],
    });
  });
});
