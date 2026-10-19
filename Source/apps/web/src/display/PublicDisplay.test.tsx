import { DISPLAY_KEY_AUTH, type DisplayBoard } from '@vente-web/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { PublicDisplay } from './PublicDisplay.js';

const KEY = 'ECRAN-1';
const at = '2026-10-19T08:00:00.000Z';

function board(register: DisplayBoard['register']): DisplayBoard {
  return { sound: false, register, delivery: [] };
}

describe('public display (T-041, RG-DSP-01 à 03)', () => {
  it('shows the last calls per queue, the latest big, and refreshes on each call', async () => {
    const api = fakeApi({ [`GET /display/${KEY}`]: ok(board([])) });
    render(<PublicDisplay displayKey={KEY} />);
    const register = await screen.findByRole('region', { name: labels.display.register });
    expect(within(register).getByText(labels.display.empty)).toBeInTheDocument();
    const [socket] = fakeRealtime.sockets;
    expect(socket?.options).toMatchObject({ auth: { [DISPLAY_KEY_AUTH]: KEY } });

    api.on(
      `GET /display/${KEY}`,
      ok(
        board([
          { ticket: 'A15', station: 'Caisse 2', calledAt: at },
          { ticket: 'B3', station: null, calledAt: at },
        ]),
      ),
    );
    act(() => fakeRealtime.emit('ticket.called', { queue: 'register', orderId: 'x' }));
    await waitFor(() =>
      expect(within(register).getByText('A15 → Caisse 2')).toHaveClass('text-96'),
    );
    expect(within(register).getByText('B3')).toHaveClass('text-36');
  });

  it('says so when the key is unknown or the display is off', async () => {
    fakeApi({ [`GET /display/${KEY}`]: apiError(404, 'NOT_FOUND') });
    render(<PublicDisplay displayKey={KEY} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.display.unknown);
  });
});
