import { EXPORT_KINDS } from '@vente-web/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { periodOf, shopToday } from '../owner/dashboard-period.js';
import { ExportsPanel } from './ExportsPanel.js';

const text = labels.exports;

describe('the Excel exports (T-071, RG-EXP-03)', () => {
  it('offers the owner every export over this month', () => {
    render(<ExportsPanel role="owner" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(EXPORT_KINDS.length);
    const { from, to } = periodOf('month', shopToday());
    expect(screen.getByRole('link', { name: text.download('Ventes') }).getAttribute('href')).toBe(
      `/api/v1/exports/sales?from=${from}&to=${to}`,
    );
    expect(
      screen.getByRole('link', { name: text.download(`État du stock (${text.now})`) }),
    ).toBeTruthy();
  });

  it('gives the cashier their closings, the admin the journal, the salesperson nothing', () => {
    const { unmount } = render(<ExportsPanel role="cashier" />);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Clôtures de caisse',
    ]);
    unmount();
    const admin = render(<ExportsPanel role="admin" />);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Journal d’audit',
    ]);
    admin.unmount();
    const { container } = render(<ExportsPanel role="sales" />);
    expect(container.innerHTML).toBe('');
  });

  it('holds the links back over a period upside down', () => {
    render(<ExportsPanel role="cashier" />);
    fireEvent.change(screen.getByLabelText(text.from), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText(text.to), { target: { value: '2026-01-01' } });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toBe(text.invalid);
  });
});
