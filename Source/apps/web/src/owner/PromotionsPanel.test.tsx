import { ERROR_LABELS, type Promotion } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { SAVON, searchResult } from '../sales/test-hits.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { PromotionsPanel } from './PromotionsPanel.js';

const text = labels.promotions;

const PROMOTION = '0192a4f0-0000-7000-8000-000000000601';
const LIST = 'GET /promotions';
const MARK = 'POST /promotions';
const WITHDRAW = `POST /promotions/${PROMOTION}/withdraw`;

const promotion = (over: Partial<Promotion> = {}): Promotion => ({
  id: PROMOTION,
  product: { id: SAVON.id, sku: SAVON.sku, name: SAVON.name },
  startsOn: '2026-10-06',
  endsOn: '2026-10-12',
  pitch: 'Nouveau parfum',
  withdrawnAt: null,
  ...over,
});

function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <StatusLineProvider>
      <Frame workspace="owner" name={labels.workspaces.owner.title}>
        <PromotionsPanel />
      </Frame>
    </StatusLineProvider>,
  );
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

async function pickSoap() {
  fireEvent.change(panel().getByRole('searchbox', { name: text.search }), {
    target: { value: 'sav' },
  });
  fireEvent.click(panel().getByRole('button', { name: text.searchGo }));
  fireEvent.click(await panel().findByRole('button', { name: text.pick(SAVON.sku, SAVON.name) }));
}

describe('PromotionsPanel — the owner’s products to propose (T-037, RG-DEV-06 §6, H49 b)', () => {
  it('marks a product with its dates and argument, then lists it', async () => {
    const api = mount({
      [LIST]: ok({ items: [] }),
      'GET /products/search?q=sav': ok(searchResult([SAVON])),
      [MARK]: { status: 201, body: promotion() },
    });
    expect(await panel().findByText(text.none)).toBeInTheDocument();
    const add = panel().getByRole('button', { name: text.add });
    expect(add).toBeDisabled();

    await pickSoap();
    fireEvent.change(panel().getByLabelText(text.from), { target: { value: '2026-10-06' } });
    fireEvent.change(panel().getByLabelText(text.to), { target: { value: '2026-10-12' } });
    fireEvent.change(panel().getByRole('textbox', { name: text.pitch }), {
      target: { value: '  Nouveau parfum ' },
    });
    fireEvent.click(add);

    await waitFor(() => expect(band().textContent).toBe(text.added(SAVON.name)));
    expect(api.callsTo(MARK)[0]?.body).toEqual({
      productId: SAVON.id,
      startsOn: '2026-10-06',
      endsOn: '2026-10-12',
      pitch: 'Nouveau parfum',
    });
    const row = within(panel().getByRole('table', { name: text.title })).getAllByRole('row')[1];
    expect(row).toHaveTextContent('06/10/2026');
    expect(row).toHaveTextContent('12/10/2026');
    expect(row).toHaveTextContent('Nouveau parfum');
    expect(add).toBeDisabled();
  });

  it('withdraws a product', async () => {
    const api = mount({
      [LIST]: ok({ items: [promotion()] }),
      [WITHDRAW]: ok(promotion({ withdrawnAt: '2026-10-06T08:00:00.000Z' })),
    });
    fireEvent.click(await panel().findByRole('button', { name: text.withdrawOf(SAVON.name) }));

    await waitFor(() => expect(band().textContent).toBe(text.withdrawn(SAVON.name)));
    expect(panel().getByText(text.none)).toBeInTheDocument();
    expect(api.callsTo(WITHDRAW)).toHaveLength(1);
  });

  it('says why the server refuses', async () => {
    mount({
      [LIST]: ok({ items: [promotion()] }),
      'GET /products/search?q=sav': ok(searchResult([SAVON])),
      [MARK]: apiError(409, 'PROMOTION_OVERLAP'),
    });
    await pickSoap();
    fireEvent.click(panel().getByRole('button', { name: text.add }));

    expect(await panel().findByRole('alert')).toHaveTextContent(ERROR_LABELS.PROMOTION_OVERLAP);
  });
});
