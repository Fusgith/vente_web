import type { ProductDetail, ProductRow } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { ProductsPanel } from './ProductsPanel.js';

const text = labels.products;

const SOAP = '0192a4f0-0000-7000-8000-000000000231';
const PIECE = '0192a4f0-0000-7000-8000-000000000241';
const OLD = '0192a4f0-0000-7000-8000-000000000251';
const NEW = '0192a4f0-0000-7000-8000-000000000252';

const row: ProductRow = {
  id: SOAP,
  sku: 'SAV-001',
  name: 'Savon de Marseille 200 g',
  category: 'Hygiène',
  baseUnit: 'pièce',
  isActive: true,
  available: '432.00',
  units: [{ label: 'pièce', factor: '1', price: '5000.00' }],
};
const detail = (
  price: string,
  history: ProductDetail['units'][number]['prices'],
): ProductDetail => ({
  id: SOAP,
  sku: 'SAV-001',
  name: 'Savon de Marseille 200 g',
  category: null,
  baseUnit: 'pièce',
  alertThreshold: null,
  isActive: true,
  onHand: '432.00',
  available: '432.00',
  units: [
    {
      id: PIECE,
      label: 'pièce',
      factor: '1',
      isBase: true,
      barcode: null,
      isActive: true,
      price,
      used: true,
      prices: history,
    },
  ],
});
const first = {
  id: OLD,
  price: '5000.00',
  effectiveFrom: '2026-10-01T08:00:00.000Z',
  effectiveTo: null,
  source: 'IMPORT' as const,
  setBy: 'Admin',
};

describe('products on screen (T-092, RG-ART-07)', () => {
  it('lists the products and sets a new dated price, the old one kept', async () => {
    const api = fakeApi({
      'GET /products?page=1': ok({ items: [row], total: 1 }),
      [`GET /products/${SOAP}`]: ok(detail('5000.00', [first])),
      [`POST /products/${SOAP}/units/${PIECE}/prices`]: ok(
        detail('5500.00', [
          {
            ...first,
            id: NEW,
            price: '5500.00',
            source: 'MANUAL',
            setBy: 'Hery',
            effectiveFrom: '2026-10-19T08:00:00.000Z',
          },
          { ...first, effectiveTo: '2026-10-19T08:00:00.000Z' },
        ]),
      ),
    });
    render(
      <StatusLineProvider>
        <ProductsPanel />
      </StatusLineProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: text.openOf('SAV-001') }));
    const sheet = within(await screen.findByRole('dialog'));
    fireEvent.click(await sheet.findByRole('button', { name: text.changePriceOf('pièce') }));
    fireEvent.change(sheet.getByLabelText(text.newPrice('pièce')), {
      target: { value: '5 500' },
    });
    fireEvent.click(sheet.getByRole('button', { name: text.applyPrice }));

    await waitFor(() =>
      expect(api.callsTo(`POST /products/${SOAP}/units/${PIECE}/prices`)[0]?.body).toEqual({
        price: '5500',
      }),
    );
    expect(await sheet.findByText('+10,0 %')).toBeVisible();
    expect(sheet.getByText(text.current)).toBeVisible();
  });
});
