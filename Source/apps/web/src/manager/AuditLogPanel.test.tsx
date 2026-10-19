import { formatMga, ROLE_LABELS, type AuditLogEntry } from '@vente-web/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { changesOf, subjectOf } from './audit-changes.js';
import { AuditLogPanel } from './AuditLogPanel.js';

const text = labels.audit;
const id = (n: number) => `0192a4f0-0000-7000-8000-${String(n).padStart(12, '0')}`;

function entry(n: number, overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: id(n),
    at: '2026-10-06T07:30:00.000Z',
    user: { username: 'soa', fullName: 'Soa Caissière' },
    activeRole: 'cashier',
    origin: 'LAN',
    action: 'auth.login',
    entityType: 'session',
    entityId: id(900 + n),
    before: null,
    after: null,
    reason: null,
    ...overrides,
  };
}

const PAID = entry(2, {
  action: 'order.paid',
  entityType: 'order',
  before: { status: 'SUBMITTED', number: 'C-2026-0007' },
  after: { status: 'PAID', number: 'C-2026-0007' },
});

/** Testing Library compares text with its spaces collapsed, non-breaking ones included. */
const flat = (value: string) => value.replace(/\s/g, ' ');

describe('changesOf (RG-AUD-01, T-097)', () => {
  it('shows each field that changed, before → after, in the shop’s words', () => {
    expect(changesOf(PAID.before, PAID.after)).toEqual(['État : Validée, en file → Payée']);
  });

  it('shows each field of a new record, and plain values as they are', () => {
    expect(changesOf(null, { name: 'Rasoa', tags: ['a'] })).toEqual(['Nom : Rasoa', 'tags : a']);
    expect(changesOf(3, 5)).toEqual(['3 → 5']);
    expect(changesOf(null, null)).toEqual([]);
  });

  it('names the records, dates at the shop, amounts in MGA, only the lines that changed', () => {
    const refs = { [id(7)]: 'Rasoa', [id(8)]: 'Vola Commerciale' };
    const line = { sku: 'SAV-01', unit: 'paquet', qty: '2', unitPrice: '8500', discount: '0' };
    expect(
      changesOf(
        { customerId: id(7), lines: [line, { ...line, sku: 'RIZ-01' }], isActive: true },
        {
          customerId: id(7),
          salesUserId: id(8),
          expiresAt: '2026-10-20T14:00:00.000Z',
          lines: [
            { ...line, discount: '850' },
            { ...line, sku: 'RIZ-01' },
          ],
          orderDiscount: { kind: 'pct', value: '5' },
          isActive: false,
          other: id(9),
        },
        refs,
      ).map(flat),
    ).toEqual(
      [
        `Ligne 1 : Code SAV-01, Unité paquet, Quantité 2, Prix unitaire ${formatMga('8500')}, Remise ${formatMga('0')} → Code SAV-01, Unité paquet, Quantité 2, Prix unitaire ${formatMga('8500')}, Remise ${formatMga('850')}`,
        'Active : oui → non',
        'Commercial : Vola Commerciale',
        'Expire le : 20/10/2026 17:00',
        'Remise sur le total : 5 %',
        `other : ${id(9)}`,
      ].map(flat),
    );
    expect(subjectOf('order', id(7), refs)).toBe('Commande Rasoa');
    expect(subjectOf('setting', 'cash_rounding', refs)).toBe('Paramètre cash_rounding');
    expect(subjectOf('order', id(9), refs)).toBe('Commande');
  });
});

describe('the audit log panel (T-014, RG-AUD-01)', () => {
  it('reads today’s operations, the older ones on demand, then another day narrowed', async () => {
    const api = fakeApi({
      'GET /audit': ok({
        entries: [
          PAID,
          entry(1),
          entry(3, { user: null, activeRole: null, action: 'auth.mystery', reason: 'test' }),
        ],
        more: true,
        refs: { [id(902)]: 'C-2026-0007' },
      }),
      [`GET /audit?before=${id(3)}`]: ok({
        entries: [entry(4, { origin: 'REMOTE', activeRole: 'owner', action: 'auth.logout' })],
        more: false,
      }),
      'GET /audit?day=2026-10-05&subject=orders&user=soa': ok({ entries: [], more: false }),
    });
    render(<AuditLogPanel />);
    const panel = screen.getByRole('region', { name: text.title });

    expect(await within(panel).findByText(text.actions['order.paid'] ?? '')).toBeVisible();
    expect(within(panel).getByText('État : Validée, en file → Payée')).toBeVisible();
    expect(within(panel).getByText('Commande C-2026-0007')).toBeVisible();
    expect(within(panel).getByText(text.actions['auth.login'] ?? '')).toBeVisible();
    expect(within(panel).getAllByText(ROLE_LABELS.cashier)).toHaveLength(2);
    // An unknown visitor and an operation the screen has no name for still show.
    expect(within(panel).getByText(text.unknownUser)).toBeVisible();
    expect(within(panel).getByText('auth.mystery')).toBeVisible();
    expect(within(panel).getByText(text.reason('test'))).toBeVisible();

    fireEvent.click(within(panel).getByRole('button', { name: text.older }));
    expect(await within(panel).findByText(text.actions['auth.logout'] ?? '')).toBeVisible();
    expect(within(panel).getByText(`${ROLE_LABELS.owner}, ${text.remote}`)).toBeVisible();
    expect(within(panel).getAllByRole('row')).toHaveLength(5);
    expect(within(panel).queryByRole('button', { name: text.older })).not.toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText(text.day), { target: { value: '2026-10-05' } });
    fireEvent.change(within(panel).getByLabelText(text.subject), {
      target: { value: 'orders' },
    });
    fireEvent.change(within(panel).getByLabelText(text.user), { target: { value: ' soa ' } });
    fireEvent.click(within(panel).getByRole('button', { name: text.show }));
    expect(await within(panel).findByText(text.none)).toBeVisible();
    expect(api.callsTo('GET /audit?day=2026-10-05&subject=orders&user=soa')).toHaveLength(1);
  });
});
