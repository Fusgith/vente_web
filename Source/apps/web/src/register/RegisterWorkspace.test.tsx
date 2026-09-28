import { ERROR_LABELS, formatAmount } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { RegisterWorkspace } from './RegisterWorkspace.js';
import { atMyRegister, ID, item, OPENED, orderOf, queueOf } from './test-queue.js';

const text = labels.register;
const shown = (value: string) => value.replace(/\s/g, ' ');

function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi({ ...OPENED, ...handlers });
  render(
    <RealtimeProvider me={meFor({ user: HERY, activeRole: 'cashier' })}>
      <StatusLineProvider>
        <Frame workspace="cashier" name={labels.workspaces.cashier.title}>
          <RegisterWorkspace userId={HERY.id} />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  return api;
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const bandAlert = () => within(screen.getByRole('contentinfo')).getByRole('alert');
const table = () => screen.findByRole('table');

describe('register screen (T-040, RG-FIL-01 à 04)', () => {
  it('shows the queue in calling order, the amounts under one sign, the next named', async () => {
    mount({
      'GET /queues/register': ok(
        queueOf([item(1, { priority: true }), item(2, { noShowCount: 2 }), item(3)]),
      ),
    });
    const rows = within(await table())
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      'A1',
      'A2',
      'A3',
    ]);
    expect(rows[0]).toHaveTextContent(text.priority);
    expect(rows[1]).toHaveTextContent(text.absences(2));
    expect(rows[1]).toHaveTextContent(text.minutes(10));
    expect(rows[0]).toHaveTextContent(shown(formatAmount('65000')));
    expect(await table()).not.toHaveTextContent(/\d\s*MGA/);
    expect(screen.getByRole('columnheader', { name: 'Montant (MGA)' })).toBeVisible();
    expect(screen.getByText(text.next('A1', 'Rasoa Hanta'))).toBeVisible();
    expect(screen.getByText(text.waitingCount(3))).toBeVisible();
  });

  it('calls the next ticket, then shows it big with the name to announce (RG-DSP-05)', async () => {
    const first = item(1);
    const api = mount({
      'GET /queues/register': ok(queueOf([first, item(2)])),
      'POST /queues/register/call-next': ok(orderOf(first)),
      [`GET /orders/${first.orderId}`]: ok(orderOf(first)),
    });
    await table();
    api.on('GET /queues/register', ok(queueOf([item(2)], [atMyRegister(first)])));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(text.callNext) }));

    // The layout changes once a customer is called: the panel is looked for afresh.
    const panel = () => screen.getByRole('region', { name: text.servingTitle });
    await waitFor(() => expect(within(panel()).getByText('A1')).toHaveClass('text-96'));
    expect(within(panel()).getByText('Rasoa Hanta')).toBeVisible();
    expect(band()).toHaveTextContent(text.called('A1', 'Rasoa Hanta'));
    // One customer at a time: their order to check, the queue in short, no other call.
    expect(
      await screen.findByRole('region', { name: text.orderTitle(first.number) }),
    ).toBeVisible();
    expect(screen.getByRole('region', { name: new RegExp(text.queueTitle) })).toHaveTextContent(
      'A2',
    );
    expect(screen.queryByRole('button', { name: text.call('A2') })).toBeNull();
  });

  it('sends an absent customer back to the queue (RG-FIL-04)', async () => {
    const first = atMyRegister(item(1));
    const api = mount({
      'GET /queues/register': ok(queueOf([item(2)], [first])),
      [`GET /orders/${first.orderId}`]: ok(orderOf(first)),
      [`POST /orders/${first.orderId}/no-show`]: ok({ ...orderOf(first), status: 'SUBMITTED' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.noShow }));
    await waitFor(() => expect(band()).toHaveTextContent(text.absent('A1', 'Rasoa Hanta')));
    expect(api.callsTo(`POST /orders/${first.orderId}/no-show`)).toHaveLength(1);
  });

  it('calls a ticket out of turn, and says why a call is refused', async () => {
    const second = item(2);
    const api = mount({
      'GET /queues/register': ok(queueOf([item(1), second])),
      [`POST /orders/${second.orderId}/call`]: apiError(409, 'ORDER_NOT_IN_QUEUE'),
    });
    await table();
    fireEvent.click(screen.getByRole('button', { name: text.call('A2') }));
    await waitFor(() => expect(bandAlert()).toHaveTextContent(ERROR_LABELS.ORDER_NOT_IN_QUEUE));
    expect(api.callsTo(`POST /orders/${second.orderId}/call`)).toHaveLength(1);
  });

  it('reads the queue again when it changes, or when the channel comes back', async () => {
    const api = mount({ 'GET /queues/register': ok(queueOf([item(1)])) });
    await table();
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('queue.changed')?.size).toBeGreaterThan(0),
    );
    api.on('GET /queues/register', ok(queueOf([item(1), item(2)])));
    act(() =>
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: ID(2),
        change: 'entered',
      }),
    );
    await waitFor(() => expect(screen.getByText(text.waitingCount(2))).toBeVisible());
    act(() => fakeRealtime.emit('connect', undefined));
    await waitFor(() => expect(api.callsTo('GET /queues/register')).toHaveLength(3));
  });
});
