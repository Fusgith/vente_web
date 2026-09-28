import type { QueueItem } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { item, orderWithLines } from '../register/test-queue.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { DeliveryWorkspace } from './DeliveryWorkspace.js';

const text = labels.delivery;

/** Paid, in the delivery queue; `status` once held at Hery's counter. */
const paid = (n: number, status?: 'PREPARING' | 'READY'): QueueItem =>
  item(n, {
    status: status ?? 'PAID',
    paidAt: new Date(Date.now() - n * 60_000).toISOString(),
    ...(status ? { servedBy: { id: HERY.id, fullName: HERY.fullName } } : {}),
  });
const deliveryQueue = (waiting: QueueItem[], serving: QueueItem[] = []) =>
  ok({ queue: 'delivery', waiting, serving });

function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: HERY, activeRole: 'warehouse' })}>
      <StatusLineProvider>
        <Frame workspace="warehouse" name={labels.workspaces.warehouse.title}>
          <DeliveryWorkspace userId={HERY.id} />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  return api;
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('delivery counter (T-060, RG-LIV-01 à 03)', () => {
  it('lists the paid orders, without amounts, and takes the next one', async () => {
    const first = paid(1);
    const api = mount({
      'GET /queues/delivery': deliveryQueue([first, paid(2)]),
      'POST /queues/delivery/take-next': ok({ ...orderWithLines(first, 5), status: 'PREPARING' }),
      [`GET /orders/${first.orderId}`]: ok({ ...orderWithLines(first, 5), status: 'PREPARING' }),
    });
    const table = await screen.findByRole('region', { name: new RegExp(text.queueTitle) });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).queryByText(/MGA/)).toBeNull();
    expect(within(table).getByRole('button', { name: text.take('A2') })).toBeEnabled();
    expect(screen.getByText(text.next('A1', 'Rasoa Hanta'))).toBeVisible();

    api.on('GET /queues/delivery', deliveryQueue([paid(2)], [paid(1, 'PREPARING')]));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(text.takeNext) }));
    await waitFor(() => expect(band()).toHaveTextContent(text.taken('A1', 'Rasoa Hanta')));
    expect(api.callsTo('POST /queues/delivery/take-next')).toHaveLength(1);
    // What to fetch, in the sale unit and its base unit equivalence.
    const order = await screen.findByRole('region', { name: text.orderTitle('A1', 'Rasoa Hanta') });
    expect(order).toHaveTextContent('SAV-001');
    expect(order).toHaveTextContent('(× 6 pièce)');
  });

  it('calls the customer once prepared', async () => {
    const mine = paid(1, 'PREPARING');
    const api = mount({
      'GET /queues/delivery': deliveryQueue([], [mine]),
      [`GET /orders/${mine.orderId}`]: ok({ ...orderWithLines(mine, 5), status: 'PREPARING' }),
      [`POST /orders/${mine.orderId}/delivery/ready`]: ok({
        ...orderWithLines(mine, 6),
        status: 'READY',
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.ready }));
    await waitFor(() => expect(band()).toHaveTextContent(text.called('A1', 'Rasoa Hanta')));
    expect(api.callsTo(`POST /orders/${mine.orderId}/delivery/ready`)).toHaveLength(1);
  });

  it('hands over once every line is ticked (RG-LIV-03)', async () => {
    const mine = paid(1, 'READY');
    const api = mount({
      'GET /queues/delivery': deliveryQueue([], [mine]),
      [`GET /orders/${mine.orderId}`]: ok({ ...orderWithLines(mine, 6), status: 'READY' }),
      [`POST /orders/${mine.orderId}/delivery/deliver`]: ok({
        ...orderWithLines(mine, 7),
        status: 'DELIVERED',
      }),
    });
    // Announced big, with the customer's name (RG-TKT-03).
    expect(await screen.findByText(text.announce)).toBeVisible();
    const deliver = await screen.findByRole('button', { name: text.deliver });
    expect(deliver).toBeDisabled();
    expect(screen.getByText(text.leftToTick(2))).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: text.handed(1) }));
    expect(deliver).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: text.handed(2) }));
    expect(screen.getByText(text.allTicked)).toBeVisible();
    fireEvent.click(deliver);

    await waitFor(() => expect(band()).toHaveTextContent(text.delivered('A1', 'Rasoa Hanta')));
    expect(api.callsTo(`POST /orders/${mine.orderId}/delivery/deliver`)[0]!.body).toEqual({
      version: 6,
      delivered: [1, 2],
    });
  });

  it('sends an absent customer back to the queue', async () => {
    const mine = paid(1, 'READY');
    const api = mount({
      'GET /queues/delivery': deliveryQueue([], [mine]),
      [`GET /orders/${mine.orderId}`]: ok({ ...orderWithLines(mine, 6), status: 'READY' }),
      [`POST /orders/${mine.orderId}/delivery/no-show`]: ok({
        ...orderWithLines(mine, 7),
        status: 'PAID',
      }),
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: text.handed(1) }));
    api.on('GET /queues/delivery', deliveryQueue([paid(1)]));
    fireEvent.click(screen.getByRole('button', { name: text.noShow }));
    await waitFor(() => expect(band()).toHaveTextContent(text.absent('A1', 'Rasoa Hanta')));
    expect(api.callsTo(`POST /orders/${mine.orderId}/delivery/no-show`)).toHaveLength(1);

    // Called again later: nothing ticked from the first time.
    api.on('GET /queues/delivery', deliveryQueue([], [mine]));
    api.on('POST /queues/delivery/take-next', ok({ ...orderWithLines(mine, 9), status: 'READY' }));
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(text.takeNext) }));
    const first = await screen.findByRole('checkbox', { name: text.handed(1) });
    expect(first).not.toBeChecked();
  });
});
