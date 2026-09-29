import type { Order } from '@vente-web/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { NoShowNotices } from '../manager/NoShowNotices.js';
import { OrderNotices } from '../sales/OrderNotices.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { RealtimeProvider } from './RealtimeProvider.js';

const ORDER_ID = '0192a4f0-0000-7000-8000-000000000401';

const order = {
  id: ORDER_ID,
  number: 'D-2026-000042',
  version: 3,
  customer: {
    id: '0192a4f0-0000-7000-8000-000000000301',
    name: 'Rasoa Hanta',
    phone: '0341122233',
  },
  salesUser: { id: RIJA.id, fullName: RIJA.fullName },
  lines: [],
  grossTotal: '0.00',
  lineDiscounts: '0.00',
  subtotal: '0.00',
  orderDiscountPct: null,
  orderDiscount: '0.00',
  discountTotal: '0.00',
  discountCode: null,
  total: '0.00',
  createdAt: '2026-09-26T07:00:00.000Z',
  updatedAt: '2026-09-26T07:05:00.000Z',
  status: 'SUBMITTED',
  ticket: { letter: 'A', seq: 15, date: '2026-09-26' },
  submittedAt: '2026-09-26T07:05:00.000Z',
  expiresAt: null,
} satisfies Order;

async function mount(role: 'sales' | 'manager', children: ReactNode) {
  fakeApi({ [`GET /orders/${ORDER_ID}`]: ok(order) });
  render(
    <RealtimeProvider me={meFor({ user: role === 'sales' ? RIJA : HERY, activeRole: role })}>
      <StatusLineProvider>
        <Frame workspace={role} name={labels.workspaces[role].title}>
          {children}
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('notices from the queue (T-040)', () => {
  it('tells the salesperson their ticket is called, to warn the customer (RG-DSP-05)', async () => {
    await mount('sales', <OrderNotices />);
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('ticket.called')?.size).toBe(1),
    );
    act(() => fakeRealtime.emit('ticket.called', { queue: 'register', orderId: ORDER_ID }));
    await waitFor(() =>
      expect(band()).toHaveTextContent(labels.sales.called('A15', 'Rasoa Hanta')),
    );
  });

  it('tells the salesperson their order expired unpaid, its stock freed (RG-CMD-08)', async () => {
    await mount('sales', <OrderNotices />);
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('order.status_changed')?.size).toBe(1),
    );
    act(() =>
      fakeRealtime.emit('order.status_changed', { orderId: ORDER_ID, status: 'AT_REGISTER' }),
    );
    act(() => fakeRealtime.emit('order.status_changed', { orderId: ORDER_ID, status: 'EXPIRED' }));
    await waitFor(() =>
      expect(band()).toHaveTextContent(labels.sales.expired('A15', 'Rasoa Hanta')),
    );
  });

  it('tells the manager of a customer absent twice (RG-FIL-04)', async () => {
    await mount('manager', <NoShowNotices />);
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('order.no_show')?.size).toBe(1),
    );
    act(() => fakeRealtime.emit('order.no_show', { orderId: ORDER_ID, noShowCount: 2 }));
    await waitFor(() =>
      expect(band()).toHaveTextContent(labels.manager.noShows('A15', 'Rasoa Hanta', 2)),
    );
  });
});
