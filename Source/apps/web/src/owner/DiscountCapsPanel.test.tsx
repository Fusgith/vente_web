import type { DiscountCaps, ProductDiscountCaps } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { DiscountCapsPanel } from './DiscountCapsPanel.js';

const text = labels.caps;

const SOAPS = '0192a4f0-0000-7000-8000-000000000301';
const SOAP = '0192a4f0-0000-7000-8000-000000000311';
const PIECE = '0192a4f0-0000-7000-8000-000000000321';
const CARTON = '0192a4f0-0000-7000-8000-000000000322';
const LIST = 'GET /discount-caps';
const SEARCH = 'GET /products/search?q=sav';
const CAPS = `GET /products/${SOAP}/discount-caps`;

const caps = (soaps: string | null): DiscountCaps => ({
  defaultPct: '5.00',
  categories: [{ id: SOAPS, name: 'Savons et hygiène', maxDiscountPct: soaps }],
});
const soap = (carton: string | null): ProductDiscountCaps => ({
  productId: SOAP,
  sku: 'SAV-001',
  name: 'Savon de Marseille 200 g',
  maxDiscountPct: null,
  category: { id: SOAPS, name: 'Savons et hygiène', maxDiscountPct: null },
  defaultPct: '5.00',
  units: [
    { id: PIECE, label: 'pièce', factor: '1', maxDiscountPct: null, effectivePct: '5.00' },
    {
      id: CARTON,
      label: 'carton',
      factor: '72',
      maxDiscountPct: carton,
      effectivePct: carton ?? '5.00',
    },
  ],
});
const hits = ok({
  exact: null,
  more: false,
  items: [
    {
      id: SOAP,
      sku: 'SAV-001',
      name: 'Savon de Marseille 200 g',
      category: { id: SOAPS, name: 'Savons et hygiène' },
      baseUnit: 'pièce',
      available: '130.00',
      units: [],
    },
  ],
});

async function mount(editable: boolean, handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  const role = editable ? 'owner' : 'manager';
  render(
    <RealtimeProvider me={meFor({ user: { ...RIJA, roles: [role] }, activeRole: role })}>
      <StatusLineProvider>
        <Frame workspace={role} name={labels.workspaces[role].title}>
          <DiscountCapsPanel editable={editable} />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

async function openSoap() {
  fireEvent.change(panel().getByRole('searchbox', { name: text.search }), {
    target: { value: 'sav' },
  });
  fireEvent.click(panel().getByRole('button', { name: text.searchGo }));
  fireEvent.click(
    await panel().findByRole('button', { name: text.open('SAV-001', 'Savon de Marseille 200 g') }),
  );
  return panel().findByRole('heading', { name: text.open('SAV-001', 'Savon de Marseille 200 g') });
}

describe('the discount caps, set by the owner (RG-REM-01, H15)', () => {
  it('lowers a category’s cap, and refuses a rate over 100', async () => {
    const api = await mount(true, { [LIST]: ok(caps('8.00')) });
    const field = await panel().findByRole('textbox', { name: text.capOf('Savons et hygiène') });
    expect(field).toHaveValue('8');
    expect(panel().getByRole('textbox', { name: text.generalField })).toHaveValue('5');
    const save = panel().getByRole('button', { name: text.saveOf('Savons et hygiène') });
    expect(save).toBeDisabled();

    fireEvent.change(field, { target: { value: '120' } });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeDisabled();

    fireEvent.change(field, { target: { value: '7,5' } });
    api.on(`PUT /categories/${SOAPS}/discount-cap`, ok(caps('7.50')));
    fireEvent.click(save);

    await waitFor(() =>
      expect(band()).toHaveTextContent(text.saved('Savons et hygiène', '7,5').replace(/\s/g, ' ')),
    );
    expect(api.callsTo(`PUT /categories/${SOAPS}/discount-cap`)[0]!.body).toEqual({ pct: '7.5' });
    expect(field).toHaveValue('7,5');
    await waitFor(() => expect(save).toBeDisabled());
  });

  it('finds a product, then clears a unit’s own cap so the general one applies', async () => {
    const api = await mount(true, {
      [LIST]: ok(caps(null)),
      [SEARCH]: hits,
      [CAPS]: ok(soap('8.00')),
      [`PUT /product-units/${CARTON}/discount-cap`]: ok(soap(null)),
    });
    await openSoap();
    const carton = panel().getByRole('textbox', { name: text.capOf('SAV-001, carton') });
    expect(carton).toHaveValue('8');
    expect(panel().getByRole('row', { name: /carton/ })).toHaveTextContent(text.pct('8'));

    fireEvent.change(carton, { target: { value: '' } });
    fireEvent.click(panel().getByRole('button', { name: text.saveOf('SAV-001, carton') }));

    await waitFor(() =>
      expect(band()).toHaveTextContent(text.saved('SAV-001, carton', null).replace(/\s/g, ' ')),
    );
    expect(api.callsTo(`PUT /product-units/${CARTON}/discount-cap`)[0]!.body).toEqual({
      pct: null,
    });
    expect(panel().getByRole('row', { name: /carton/ })).toHaveTextContent(text.pct('5'));
  });

  it('shows the manager the caps, without a way to change them', async () => {
    await mount(false, { [LIST]: ok(caps('8.00')), [SEARCH]: hits, [CAPS]: ok(soap(null)) });
    expect(await panel().findByText(text.readOnly)).toBeVisible();
    expect(panel().getByText(text.pct('8'))).toBeVisible();
    await openSoap();

    expect(panel().queryByRole('textbox')).toBeNull();
    expect(panel().queryByRole('button', { name: /Enregistrer/ })).toBeNull();
    expect(panel().getByRole('row', { name: /carton/ })).toHaveTextContent(text.none);
  });
});
