import { CREDIT_REFUSAL_LABEL, type CreditRequest } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { CreditRequestsPanel } from './CreditRequestsPanel.js';

const text = labels.credit;
const ID = '0192a4f0-0000-7000-8000-000000000701';
const LIST = 'GET /credit-requests';
const GRANT = `POST /credit-requests/${ID}/grant`;
const OWNER = { ...RIJA, id: '0192a4f0-0000-7000-8000-000000000009', fullName: 'Naivo Boss' };

/** Rija asks the owner 119 500 MGA of credit for Rasoa, who has no conditions. */
const asked: CreditRequest = {
  id: ID,
  status: 'PENDING',
  amount: '119500.00',
  refusal: 'NO_CONDITION',
  outstanding: '0.00',
  days: null,
  customer: {
    id: '0192a4f0-0000-7000-8000-000000000702',
    name: 'Rasoa Hanta',
    phone: '0341234567',
  },
  order: {
    id: '0192a4f0-0000-7000-8000-000000000703',
    number: 'D-2026-000041',
    total: '119500.00',
  },
  requestedBy: { id: RIJA.id, fullName: RIJA.fullName },
  decidedBy: null,
  createdAt: '2026-10-21T07:00:00.000Z',
  decidedAt: null,
};

async function mount(handlers: Parameters<typeof fakeApi>[0], editable = true) {
  const api = fakeApi(handlers);
  const me = editable
    ? meFor({ user: { ...OWNER, roles: ['owner'] }, activeRole: 'owner' })
    : meFor({ user: HERY, activeRole: 'manager' });
  render(
    <RealtimeProvider me={me}>
      <StatusLineProvider>
        <Frame workspace={me.session.activeRole} name={labels.workspaces.owner.title}>
          <CreditRequestsPanel editable={editable} />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.requestsTitle }));

describe('CreditRequestsPanel — credit asked of the owner (T-095b, ⚠️ H76)', () => {
  it('the owner grants it with the days to settle', async () => {
    const api = await mount({
      [LIST]: ok({ pending: [asked], recent: [] }),
      [GRANT]: ok({ ...asked, status: 'GRANTED', days: 15 }),
    });

    expect(
      await panel().findByText(CREDIT_REFUSAL_LABEL.NO_CONDITION, { exact: false }),
    ).toBeVisible();
    fireEvent.change(panel().getByRole('textbox', { name: text.days }), {
      target: { value: '15' },
    });
    fireEvent.click(panel().getByRole('button', { name: text.grant }));

    await waitFor(() =>
      expect(within(screen.getByRole('contentinfo')).getByRole('status')).toHaveTextContent(
        text.granted('Rasoa Hanta'),
      ),
    );
    expect(api.callsTo(GRANT)[0]!.body).toEqual({ days: 15 });
    expect(screen.queryByRole('region', { name: text.requestsTitle })).toBeNull();
  });

  it('the manager only reads it', async () => {
    await mount({ [LIST]: ok({ pending: [asked], recent: [] }) }, false);

    expect(await panel().findByText('Rasoa Hanta', { exact: false })).toBeVisible();
    expect(panel().queryByRole('button')).toBeNull();
  });
});
