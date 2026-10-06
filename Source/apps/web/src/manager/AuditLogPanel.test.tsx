import { ROLE_LABELS, type AuditLogEntry } from '@vente-web/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { changesOf } from './audit-changes.js';
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

describe('changesOf (RG-AUD-01)', () => {
  it('shows each field that changed, before → after', () => {
    expect(changesOf(PAID.before, PAID.after)).toEqual(['status : SUBMITTED → PAID']);
  });

  it('shows each field of a new record, and plain values as they are', () => {
    expect(changesOf(null, { name: 'Rasoa', tags: ['a'] })).toEqual([
      'name : Rasoa',
      'tags : ["a"]',
    ]);
    expect(changesOf(3, 5)).toEqual(['3 → 5']);
    expect(changesOf(null, null)).toEqual([]);
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
    expect(within(panel).getByText('status : SUBMITTED → PAID')).toBeVisible();
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
