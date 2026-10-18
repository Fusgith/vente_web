import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { emptyDashboard, noFigures } from '../test/dashboard.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { Dashboard } from './Dashboard.js';
import { periodOf, shopToday, variation } from './dashboard-period.js';

const text = labels.dashboard;

describe('the dashboard periods (RG-DSH-01, 04)', () => {
  it('starts the week on Monday and the month on the 1st', () => {
    // 19/10/2026 is a Monday, 22/10 a Thursday.
    expect(periodOf('week', '2026-10-22')).toEqual({ from: '2026-10-19', to: '2026-10-22' });
    expect(periodOf('week', '2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-19' });
    expect(periodOf('month', '2026-10-22')).toEqual({ from: '2026-10-01', to: '2026-10-22' });
    expect(periodOf('yesterday', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' });
  });

  it('tells the variation, none against nothing', () => {
    expect(variation('12000.00', '10000.00')).toMatch(/^\+20\s%$/);
    expect(variation('8000.00', '10000.00')).toMatch(/^-20\s%$/);
    expect(variation(3, 0)).toBeNull();
  });
});

describe('the dashboard (T-070)', () => {
  it('shows the period against the one before, then its breakdowns', async () => {
    const today = shopToday();
    const api = fakeApi({
      [`GET /dashboard?from=${today}&to=${today}`]: ok({
        ...emptyDashboard(today),
        current: {
          ...noFigures,
          collected: '19500.00',
          invoices: 2,
          sales: '19500.00',
          gross: '20000.00',
          discounts: '500.00',
        },
        previous: { ...noFigures, collected: '15000.00', invoices: 1 },
        byMethod: [{ label: 'Espèces', amount: '19500.00' }],
        topProducts: [
          {
            sku: 'CLO-001',
            name: 'Clous 5 cm',
            baseUnit: 'kg',
            baseQty: '3.00',
            units: [{ unit: 'kg', qty: '3.00' }],
            sales: '19500.00',
            available: '45.75',
          },
        ],
      }),
    });
    render(<Dashboard live={false} />);

    const label = await screen.findByRole('rowheader', { name: text.figures.collected });
    const collected = within(label.closest('tr') as HTMLElement).getAllByRole('cell');
    expect(collected[0]).toHaveTextContent(/19\s500,00/);
    expect(collected[1]).toHaveTextContent(/\+30\s%/);
    expect(screen.getByText(/2,5\s%\sdu brut/)).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Espèces' })).toBeVisible();
    expect(screen.getByRole('cell', { name: /45,75 kg/ })).toBeVisible();

    const yesterday = periodOf('yesterday', today);
    const key = `GET /dashboard?from=${yesterday.from}&to=${yesterday.to}`;
    api.on(key, ok(emptyDashboard(yesterday.from)));
    fireEvent.click(screen.getByRole('button', { name: text.presets.yesterday }));
    expect((await screen.findAllByText(text.nothing)).length).toBeGreaterThan(0);
    expect(api.callsTo(key)).toHaveLength(1);
  });
});
