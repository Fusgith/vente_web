import { formatMga, type Queue, type SupervisionToday } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { item, orderOf, queueOf } from '../register/test-queue.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { SupervisionWorkspace } from './SupervisionWorkspace.js';

const text = labels.supervision;
const shown = (value: string) => value.replace(/\s/g, ' ');

const TODAY: SupervisionToday = {
  registerWait: 6,
  deliveryWait: null,
  inProgress: 3,
  paidUndelivered: { count: 2, total: '100000.00' },
};
const [a1, a2, a3] = [item(1), item(2), item(3)];
const counter = item(4, {
  status: 'PREPARING',
  servedBy: { id: '0192a4f0-0000-7000-8000-000000000601', fullName: 'Feno Magasinier' },
  station: { id: '0192a4f0-0000-7000-8000-000000000701', name: 'Comptoir 1' },
  calledAt: new Date().toISOString(),
});
const delivery = (queue: Partial<Queue> = {}): Queue => ({
  queue: 'delivery',
  serving: [],
  waiting: [],
  ...queue,
});

async function mount(handlers: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    'GET /supervision/today': ok(TODAY),
    'GET /queues/register': ok(queueOf([a1, a2, a3])),
    'GET /queues/delivery': ok(delivery()),
    ...handlers,
  });
  render(
    <RealtimeProvider me={meFor({ user: HERY, activeRole: 'manager' })}>
      <StatusLineProvider>
        <Frame workspace="manager" name={labels.workspaces.manager.title}>
          <SupervisionWorkspace />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const board = (queue: 'register' | 'delivery') =>
  within(screen.getByRole('region', { name: text.queues[queue] }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('the manager’s supervision (RG-DSP-04, RG-FIL-02)', () => {
  it('shows the day’s figures', async () => {
    await mount();
    const figures = within(await screen.findByRole('region', { name: text.indicators }));
    expect(await figures.findByText(labels.register.minutes(6))).toBeVisible();
    expect(figures.getByText(text.noWaitYet)).toBeVisible();
    expect(figures.getByText('3')).toBeVisible();
    expect(figures.getByText(shown(formatMga('100000.00')))).toBeVisible();
  });

  it('moves an order one place down from the keyboard, then marks another priority', async () => {
    const api = await mount({
      'POST /queues/register/reorder': { status: 204 },
      'POST /queues/register/priority': { status: 204 },
    });
    const handle = await board('register').findByRole('button', { name: text.move('A1') });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    await waitFor(() => expect(band()).toHaveTextContent(text.moved('A1', 'Rasoa Hanta', 2)));
    expect(api.callsTo('POST /queues/register/reorder')[0]!.body).toEqual({
      orderId: a1.orderId,
      beforeId: a3.orderId,
    });

    const priority = board('register').getByRole('button', { name: text.priorityOf('A2') });
    expect(priority).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(priority);
    await waitFor(() => expect(band()).toHaveTextContent(text.prioritized('A2', 'Rabe Paul')));
    expect(api.callsTo('POST /queues/register/priority')[0]!.body).toEqual({
      orderId: a2.orderId,
      priority: true,
    });
  });

  it('drags an order to the head of the queue', async () => {
    const api = await mount({ 'POST /queues/register/reorder': { status: 204 } });
    const handle = await board('register').findByRole('button', { name: text.move('A3') });
    // Rows 64 px tall, one under the other, as laid out on the tablet.
    board('register')
      .getAllByRole('row')
      .slice(1)
      .forEach((row, index) => {
        row.getBoundingClientRect = () => new DOMRect(0, 100 + index * 64, 800, 64);
      });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 110, pointerId: 1 });
    await waitFor(() => expect(band()).toHaveTextContent(text.moved('A3', 'Randria Solo', 1)));
    expect(api.callsTo('POST /queues/register/reorder')[0]!.body).toEqual({
      orderId: a3.orderId,
      beforeId: a1.orderId,
    });
  });

  it('cancels a waiting order with its reason (RG-ANN-01)', async () => {
    const CANCEL = `POST /orders/${a2.orderId}/cancel`;
    const api = await mount({
      [`GET /orders/${a2.orderId}`]: ok({ ...orderOf(a2), status: 'SUBMITTED', version: 3 }),
      [CANCEL]: ok({ ...orderOf(a2), status: 'CANCELLED', version: 4 }),
    });
    fireEvent.click(await board('register').findByRole('button', { name: text.cancelOf('A2') }));
    fireEvent.change(screen.getByLabelText(labels.register.cancelReason), {
      target: { value: 'Client parti' },
    });
    fireEvent.click(screen.getByRole('button', { name: labels.register.cancelOrder }));
    await waitFor(() =>
      expect(band()).toHaveTextContent(labels.register.cancelled('A2', 'Rabe Paul')),
    );
    expect(api.callsTo(CANCEL)[0]!.body).toEqual({ version: 3, reason: 'Client parti' });
    expect(screen.queryByLabelText(labels.register.cancelReason)).toBeNull();
  });

  it('gives an order held at a counter back to the delivery queue', async () => {
    const RELEASE = `POST /orders/${counter.orderId}/delivery/release`;
    const api = await mount({
      'GET /queues/delivery': ok(delivery({ serving: [counter] })),
      [RELEASE]: ok({ ...orderOf(counter), status: 'PAID' }),
    });
    const served = board('delivery');
    expect(await served.findByText(/Feno Magasinier, Comptoir 1/)).toBeVisible();
    expect(served.queryByRole('button', { name: text.cancelOf('A4') })).toBeNull();
    fireEvent.click(served.getByRole('button', { name: text.releaseOf('A4') }));
    await waitFor(() => expect(band()).toHaveTextContent(text.released('A4', 'Client')));
    expect(api.callsTo(RELEASE)).toHaveLength(1);
  });
});
