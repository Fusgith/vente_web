import { formatMga, formatTime, type IssueEntry } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { item, orderWithLines } from '../register/test-queue.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { DeliveryIssuesPanel } from './DeliveryIssuesPanel.js';

const text = labels.issues;
const shown = (value: string) => value.replace(/\s/g, ' ');

const mine = item(1, { status: 'ISSUE' });
const REPORTED_AT = '2026-09-29T07:30:00.000Z';
const LIST = 'GET /deliveries/issues';

function entry(credit: NonNullable<IssueEntry['issue']['credit']> | null = null): IssueEntry {
  return {
    order: { ...orderWithLines(mine, 5), status: credit ? 'DELIVERED' : 'ISSUE' },
    issue: {
      id: '0192a4f0-0000-7000-8000-000000000961',
      reportedBy: 'Hery Rabe',
      reportedAt: REPORTED_AT,
      note: 'Carton mouillé',
      lines: [{ position: 1, qty: '1', cause: 'DAMAGED' }],
      credit,
    },
  };
}

async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: HERY, activeRole: 'manager' })}>
      <StatusLineProvider>
        <Frame workspace="manager" name={labels.workspaces.manager.title}>
          <DeliveryIssuesPanel />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => screen.getByRole('region', { name: text.panelTitle });
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('delivery issues, the manager’s decision (RG-LIV-04, ⚠️ H37)', () => {
  it('is told of a new issue, then has the rest delivered, its credit left to refund', async () => {
    const api = await mount({ [LIST]: ok([]) });
    expect(await within(panel()).findByText(text.none)).toBeVisible();

    api.on(LIST, ok([entry()]));
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('order.status_changed')?.size).toBe(1),
    );
    act(() =>
      fakeRealtime.emit('order.status_changed', { orderId: mine.orderId, status: 'ISSUE' }),
    );
    await waitFor(() => expect(band()).toHaveTextContent(text.newIssue('A1', 'Rasoa Hanta')));
    const issue = within(panel());
    expect(issue.getByText(text.reportedBy('Hery Rabe', formatTime(REPORTED_AT)))).toBeVisible();
    expect(
      issue.getByText(text.line('1', 'paquet', 'Savon de Marseille 400 g', 'Abîmé')),
    ).toBeVisible();
    expect(issue.getByText('« Carton mouillé »')).toBeVisible();

    const DECIDE = `POST /orders/${mine.orderId}/issue/deliver-partly`;
    api.on(DECIDE, ok({ ...orderWithLines(mine, 6), status: 'DELIVERED' }));
    api.on(LIST, ok([entry({ amount: '23750.00', decidedBy: 'Hery Rabe', creditNote: null })]));
    fireEvent.click(issue.getByRole('button', { name: `${text.deliverPartly} A1` }));
    await waitFor(() =>
      expect(band()).toHaveTextContent(text.partlyDelivered('A1', 'Rasoa Hanta')),
    );
    expect(api.callsTo(DECIDE)[0]!.body).toEqual({ version: 5 });
    expect(
      await within(panel()).findByText(shown(text.pendingCredit(formatMga('23750.00')))),
    ).toBeVisible();
    expect(within(panel()).queryByRole('button', { name: `${text.requeue} A1` })).toBeNull();
  });

  it('puts the order back in the queue at its place', async () => {
    const api = await mount({ [LIST]: ok([entry()]) });
    const REQUEUE = `POST /orders/${mine.orderId}/issue/requeue`;
    api.on(REQUEUE, ok({ ...orderWithLines(mine, 6), status: 'PAID' }));
    const requeue = await within(panel()).findByRole('button', { name: `${text.requeue} A1` });
    api.on(LIST, ok([]));
    fireEvent.click(requeue);
    await waitFor(() => expect(band()).toHaveTextContent(text.requeued('A1', 'Rasoa Hanta')));
    expect(api.callsTo(REQUEUE)[0]!.body).toEqual({ version: 5 });
    expect(await within(panel()).findByText(text.none)).toBeVisible();
  });
});
