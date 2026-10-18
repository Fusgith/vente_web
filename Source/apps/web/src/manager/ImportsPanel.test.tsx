import type { ImportDetail } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { ImportsPanel } from './ImportsPanel.js';

const text = labels.imports;
const BATCH = '0192a4f0-0000-7000-8000-000000000301';

const batch: ImportDetail = {
  id: BATCH,
  fileName: 'arrivage.csv',
  mode: 'ENTRY',
  status: 'PREVIEW',
  entryDate: '2026-10-18',
  userName: 'Hery',
  createdAt: '2026-10-18T08:00:00.000Z',
  committedAt: null,
  rowsTotal: 2,
  rowsOk: 1,
  rowsError: 1,
  totals: {
    productsCreated: 0,
    productsUpdated: 1,
    unitsCreated: 0,
    qtyIn: '10.00',
    pricesChanged: 1,
  },
  lines: [
    {
      row: 2,
      sku: 'SAV-001',
      unit: 'pièce',
      product: 'update',
      unitAction: 'update',
      qty: '10.00',
      baseQty: '10.00',
      stockBefore: '432.00',
      stockAfter: '442.00',
      priceBefore: '4500.00',
      price: '5000.00',
      errors: [],
      warnings: [],
    },
    {
      row: 3,
      sku: 'BAD-001',
      unit: 'sachet',
      product: 'create',
      unitAction: 'create',
      qty: null,
      baseQty: null,
      stockBefore: null,
      stockAfter: null,
      priceBefore: null,
      price: null,
      errors: ['QTY_INVALID'],
      warnings: [],
    },
  ],
};

describe('catalog import from Excel (T-020, RG-IMP-04/05)', () => {
  it('uploads a file, shows each line, then commits the valid lines only', async () => {
    const api = fakeApi({
      'GET /imports': ok({ items: [] }),
      'POST /imports': ok(batch),
      [`POST /imports/${BATCH}/commit`]: ok({ ...batch, status: 'COMMITTED' }),
    });
    render(
      <StatusLineProvider>
        <ImportsPanel canStocktake={false} />
      </StatusLineProvider>,
    );
    expect(await screen.findByText(text.none)).toBeVisible();
    // Without the inventory right, no choice of mode (RG-IMP-08).
    expect(screen.queryByText(text.stocktake)).toBeNull();

    const file = new File(['code;unite\n'], 'arrivage.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText(text.file), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: text.preview }));

    const sheet = within(await screen.findByRole('dialog'));
    expect(sheet.getByText(text.errors.QTY_INVALID)).toBeVisible();
    expect(sheet.getByText(/^432.* → 442/)).toBeVisible();
    const upload = api.callsTo('POST /imports')[0]?.body as Record<string, string>;
    expect(upload).toMatchObject({ fileName: 'arrivage.csv', mode: 'ENTRY' });
    expect(atob(upload.content ?? '')).toBe('code;unite\n');

    const commit = sheet.getByRole('button', { name: text.commit });
    expect(commit).toBeDisabled();
    fireEvent.click(sheet.getByLabelText(text.validOnly));
    fireEvent.click(commit);
    await waitFor(() =>
      expect(api.callsTo(`POST /imports/${BATCH}/commit`)[0]?.body).toEqual({ validOnly: true }),
    );
  });
});
