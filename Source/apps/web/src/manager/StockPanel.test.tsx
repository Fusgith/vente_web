import { formatQty, type ProductStock, type StockAlert } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { StockPanel } from './StockPanel.js';

const text = labels.stock;
const shown = (value: string) => value.replace(/\s/g, ' ');

const SOAP = '0192a4f0-0000-7000-8000-000000000231';
const OIL = '0192a4f0-0000-7000-8000-000000000232';
const PIECE = '0192a4f0-0000-7000-8000-000000000241';
const CARTON = '0192a4f0-0000-7000-8000-000000000242';
const LIST = 'GET /stock/alerts';
const STOCK = `GET /products/${SOAP}/stock`;
const ADJUST = `POST /products/${SOAP}/stock/adjustments`;

const oil: StockAlert = {
  productId: OIL,
  sku: 'HUI-001',
  name: 'Huile 1 L',
  baseUnit: 'bouteille',
  available: '4.00',
  alertThreshold: '12.00',
};
const soap: StockAlert = {
  productId: SOAP,
  sku: 'SAV-001',
  name: 'Savon de Marseille 200 g',
  baseUnit: 'pièce',
  available: '60.00',
  alertThreshold: '72.00',
};
const stock = (onHand: string, reserved = '0.00'): ProductStock => ({
  productId: SOAP,
  onHand,
  reserved,
  available: (Number(onHand) - Number(reserved)).toFixed(2),
  alertThreshold: '72.00',
  units: [
    { id: PIECE, label: 'pièce', factor: '1' },
    { id: CARTON, label: 'carton', factor: '72' },
  ],
  reasons: ['Casse', 'Vol', 'Erreur de comptage'],
});

async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: HERY, activeRole: 'manager' })}>
      <StatusLineProvider>
        <Frame workspace="manager" name={labels.workspaces.manager.title}>
          <StockPanel />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => screen.getByRole('region', { name: text.alerts });
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

async function openSoap() {
  fireEvent.click(await within(panel()).findByRole('button', { name: text.adjustOf('SAV-001') }));
  const sheet = within(
    await screen.findByRole('dialog', { name: text.sheetTitle('SAV-001', soap.name) }),
  );
  await waitFor(() => expect(sheet.getByRole('combobox', { name: text.unit })).toHaveValue(PIECE));
  return sheet;
}

describe('the manager’s stock, alerts and adjustments (RG-STK-05 à 07)', () => {
  it('is told of a product newly under its threshold, then takes broken goods out', async () => {
    const api = await mount({
      [LIST]: ok({ items: [oil] }),
      [STOCK]: ok(stock('130.00', '70.00')),
    });
    expect(await within(panel()).findByText('HUI-001')).toBeVisible();

    api.on(LIST, ok({ items: [oil, soap] }));
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('stock.alert')?.size).toBe(1),
    );
    act(() => fakeRealtime.emit('stock.alert', { productId: SOAP }));
    await waitFor(() => expect(band()).toHaveTextContent(text.newAlert('SAV-001', soap.name)));

    const sheet = await openSoap();
    expect(sheet.getByText(shown(text.qtyOf(formatQty('60.00'), 'pièce')))).toBeVisible();
    const submit = sheet.getByRole('button', { name: text.submitOut });
    expect(submit).toBeDisabled();

    fireEvent.change(sheet.getByRole('textbox', { name: text.qty }), { target: { value: '0,5' } });
    fireEvent.change(sheet.getByRole('combobox', { name: text.unit }), {
      target: { value: CARTON },
    });
    fireEvent.change(sheet.getByRole('combobox', { name: text.reason }), {
      target: { value: 'Casse' },
    });
    fireEvent.change(sheet.getByRole('textbox', { name: text.note }), {
      target: { value: ' Carton tombé ' },
    });
    api.on(ADJUST, ok(stock('94.00', '70.00')));
    fireEvent.click(submit);

    await waitFor(() =>
      expect(band()).toHaveTextContent(
        shown(text.adjusted('SAV-001', text.qtyOf(formatQty('94.00'), 'pièce'))),
      ),
    );
    expect(api.callsTo(ADJUST)[0]!.body).toEqual({
      direction: 'out',
      qty: '0.5',
      productUnitId: CARTON,
      reason: 'Casse',
      note: 'Carton tombé',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says how much at most can go out when the goods are reserved', async () => {
    const api = await mount({
      [LIST]: ok({ items: [soap] }),
      [STOCK]: ok(stock('130.00', '70.00')),
      [ADJUST]: apiError(409, 'ADJUSTMENT_TOO_LARGE', { available: '60.00', baseUnit: 'pièce' }),
    });
    const sheet = await openSoap();
    fireEvent.change(sheet.getByRole('textbox', { name: text.qty }), { target: { value: '61' } });
    fireEvent.change(sheet.getByRole('combobox', { name: text.reason }), {
      target: { value: 'Vol' },
    });
    fireEvent.click(sheet.getByRole('button', { name: text.submitOut }));

    expect(await sheet.findByRole('alert')).toHaveTextContent(
      shown(text.tooLarge(text.qtyOf(formatQty('60.00'), 'pièce'))),
    );
    expect(api.callsTo(ADJUST)).toHaveLength(1);
  });

  it('finds any product by code, then adds the goods a count found', async () => {
    const api = await mount({
      [LIST]: ok({ items: [] }),
      'GET /products/search?q=sav': ok({
        exact: null,
        more: false,
        items: [
          {
            id: SOAP,
            sku: 'SAV-001',
            name: soap.name,
            category: null,
            baseUnit: 'pièce',
            available: '130.00',
            units: [],
          },
        ],
      }),
      [STOCK]: ok(stock('130.00')),
      [ADJUST]: ok(stock('136.00')),
    });
    expect(await within(panel()).findByText(text.alertsNone)).toBeVisible();

    fireEvent.change(screen.getByRole('searchbox', { name: text.search }), {
      target: { value: 'sav' },
    });
    fireEvent.click(screen.getByRole('button', { name: text.searchGo }));
    const sheet = await openSoap();
    fireEvent.click(sheet.getByRole('button', { name: text.in }));
    fireEvent.change(sheet.getByRole('textbox', { name: text.qty }), { target: { value: '6' } });
    fireEvent.change(sheet.getByRole('combobox', { name: text.reason }), {
      target: { value: 'Erreur de comptage' },
    });
    fireEvent.click(sheet.getByRole('button', { name: text.submitIn }));

    await waitFor(() => expect(api.callsTo(ADJUST)).toHaveLength(1));
    expect(api.callsTo(ADJUST)[0]!.body).toMatchObject({ direction: 'in', qty: '6', note: null });
    await waitFor(() =>
      expect(
        within(panel()).getByText(shown(text.qtyOf(formatQty('136.00'), 'pièce'))),
      ).toBeVisible(),
    );
  });
});
