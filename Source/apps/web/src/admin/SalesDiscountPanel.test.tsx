import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { SalesDiscountPanel } from './SalesDiscountPanel.js';

const text = labels.salesDiscount;
const READ = 'GET /sales-discount';
const SET = 'PUT /sales-discount';

async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: { ...RIJA, roles: ['admin'] }, activeRole: 'admin' })}>
      <StatusLineProvider>
        <Frame workspace="admin" name={labels.workspaces.admin.title}>
          <SalesDiscountPanel />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('the salesperson’s discounts, allowed by the admin (H60)', () => {
  it('turns them on, then off again', async () => {
    const api = await mount({ [READ]: ok({ enabled: false }), [SET]: ok({ enabled: true }) });
    const box = await panel().findByRole('checkbox', { name: text.allow });
    expect(box).not.toBeChecked();

    fireEvent.click(box);
    await waitFor(() => expect(band()).toHaveTextContent(text.saved(true)));
    expect(box).toBeChecked();

    api.on(SET, ok({ enabled: false }));
    fireEvent.click(box);
    await waitFor(() => expect(band()).toHaveTextContent(text.saved(false)));
    expect(box).not.toBeChecked();
    expect(api.callsTo(SET).map((call) => call.body)).toEqual([
      { enabled: true },
      { enabled: false },
    ]);
  });

  it('says why a change failed, and keeps the setting as it was', async () => {
    await mount({ [READ]: ok({ enabled: true }), [SET]: apiError(403, 'AUTH_FORBIDDEN') });
    const box = await panel().findByRole('checkbox', { name: text.allow });
    fireEvent.click(box);
    expect(await panel().findByRole('alert')).toBeInTheDocument();
    expect(box).toBeChecked();
  });
});
