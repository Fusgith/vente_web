import { REALTIME_PATH, type Order } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../App.js';
import { labels } from '../labels.js';
import { fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { useRealtimeEvent } from './context.js';
import { RealtimeProvider } from './RealtimeProvider.js';

const ORDER_ID = '0192a4f0-0000-7000-8000-000000000401';

const open = () => fakeRealtime.sockets.filter((socket) => socket.connected);

function order(status: Order['status']): Order {
  const zero = '0.00';
  return {
    id: ORDER_ID,
    number: 'D-2026-000042',
    version: 2,
    customer: {
      id: '0192a4f0-0000-7000-8000-000000000301',
      name: 'Rasoa Hanta',
      phone: '0341122233',
    },
    salesUser: { id: '0192a4f0-0000-7000-8000-000000000501', fullName: 'Vola' },
    lines: [],
    grossTotal: zero,
    lineDiscounts: zero,
    subtotal: zero,
    orderDiscountPct: null,
    orderDiscount: zero,
    discountTotal: zero,
    total: zero,
    createdAt: '2026-09-26T07:00:00.000Z',
    updatedAt: '2026-09-26T07:05:00.000Z',
    status,
    ticket: { letter: 'A', seq: 15, date: '2026-09-26' },
    submittedAt: '2026-09-26T07:05:00.000Z',
    expiresAt: '2026-09-26T20:59:00.000Z',
  };
}

describe('realtime connection (T-018)', () => {
  it('opens one same-origin WebSocket per role, again on a role switch', async () => {
    fakeApi({
      'GET /auth/me': ok(meFor({ user: HERY, activeRole: 'manager' })),
      'POST /auth/switch-role': ok(meFor({ user: HERY, activeRole: 'cashier' })),
    });
    render(<App />);
    await screen.findByRole('heading', { name: labels.workspaces.manager.title });

    expect(open()).toHaveLength(1);
    // No URL: the page's own origin, and its cookie.
    expect(open()[0]!.options).toEqual({
      path: REALTIME_PATH,
      transports: ['websocket'],
      autoConnect: false,
    });

    fireEvent.change(screen.getByRole('combobox', { name: labels.shell.activeRole }), {
      target: { value: 'cashier' },
    });
    await screen.findByRole('heading', { name: labels.workspaces.cashier.title });
    expect(fakeRealtime.sockets).toHaveLength(2);
    expect(open()).toEqual([fakeRealtime.sockets[1]]);
  });

  it('closes the connection when the user signs out', async () => {
    fakeApi({
      'GET /auth/me': ok(meFor({ user: HERY, activeRole: 'manager' })),
      'POST /auth/logout': { status: 204 },
      'GET /auth/users': ok({ users: [] }),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: labels.shell.signOut }));
    await waitFor(() => expect(open()).toHaveLength(0));
  });

  it('hands over valid payloads only: an event is a hint, not data', () => {
    const seen: unknown[] = [];
    function Listener() {
      useRealtimeEvent('queue.changed', (payload) => seen.push(payload));
      return null;
    }
    render(
      <RealtimeProvider me={meFor({ user: HERY, activeRole: 'cashier' })}>
        <Listener />
      </RealtimeProvider>,
    );
    act(() => {
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: '../auth/logout',
        change: 'entered',
      });
      fakeRealtime.emit('queue.changed', {
        queue: 'kitchen',
        orderId: ORDER_ID,
        change: 'entered',
      });
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: ORDER_ID,
        change: 'entered',
      });
    });
    expect(seen).toEqual([{ queue: 'register', orderId: ORDER_ID, change: 'entered' }]);
  });
});

describe('register: an order enters the queue (RG-CMD-03)', () => {
  it('reads the order again, then says its ticket and customer in the band', async () => {
    const api = fakeApi({
      'GET /auth/me': ok(meFor({ user: HERY, activeRole: 'cashier' })),
      [`GET /orders/${ORDER_ID}`]: ok(order('SUBMITTED')),
      'GET /queues/register': ok({ queue: 'register', serving: [], waiting: [] }),
    });
    render(<App />);
    await screen.findByRole('heading', { name: labels.workspaces.cashier.title });
    // The workspace listens once the connection is handed down.
    await waitFor(() => expect(open()[0]?.listeners.get('queue.changed')?.size).toBeGreaterThan(0));

    act(() =>
      fakeRealtime.emit('queue.changed', {
        queue: 'delivery',
        orderId: ORDER_ID,
        change: 'entered',
      }),
    );
    // An order back after an absence is no news.
    act(() =>
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: ORDER_ID,
        change: 'no_show',
      }),
    );
    expect(api.callsTo(`GET /orders/${ORDER_ID}`)).toHaveLength(0);

    act(() =>
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: ORDER_ID,
        change: 'entered',
      }),
    );
    const band = within(screen.getByRole('contentinfo')).getByRole('status');
    await waitFor(() =>
      expect(band).toHaveTextContent(labels.register.newOrder('A15', 'Rasoa Hanta')),
    );
  });
});
