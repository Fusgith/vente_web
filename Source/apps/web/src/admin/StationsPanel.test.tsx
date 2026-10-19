import type { Station } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { readStationKey } from '../station-key.js';
import { fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { StationsPanel } from './StationsPanel.js';

const text = labels.stations;
const TABLET: Station = {
  id: '0190a000-0000-7000-8000-000000000001',
  type: 'SALES',
  name: 'Tablette 1',
  isActive: true,
  displayKey: null,
  pairedAt: null,
};
const SCREEN: Station = {
  ...TABLET,
  id: '0190a000-0000-7000-8000-000000000002',
  type: 'DISPLAY',
  name: 'Écran',
  displayKey: 'cle-ecran',
};

async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: { ...RIJA, roles: ['admin'] }, activeRole: 'admin' })}>
      <StatusLineProvider>
        <Frame workspace="admin" name={labels.workspaces.admin.title}>
          <StationsPanel />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('the shop’s stations (T-015, RG-USR-09, H71)', () => {
  it('adds a station, pairs this device to it and links the display', async () => {
    const api = await mount({
      'GET /stations': ok({ items: [SCREEN] }),
      'POST /stations': ok(TABLET),
      [`POST /stations/${TABLET.id}/pair`]: ok({
        station: { ...TABLET, pairedAt: '2026-10-19T08:00:00.000Z' },
        key: 'cle-tablette',
      }),
    });
    expect(await panel().findByRole('link', { name: text.displayLink })).toHaveAttribute(
      'href',
      '/ecran/cle-ecran',
    );

    fireEvent.change(panel().getByRole('textbox', { name: text.name }), {
      target: { value: 'Tablette 1' },
    });
    fireEvent.click(panel().getByRole('button', { name: text.add }));
    await waitFor(() => expect(band()).toHaveTextContent(text.added('Tablette 1')));
    expect(api.callsTo('POST /stations')[0]?.body).toEqual({ type: 'SALES', name: 'Tablette 1' });

    fireEvent.click(panel().getByRole('button', { name: `${text.pair} : Tablette 1` }));
    await waitFor(() => expect(band()).toHaveTextContent(text.paired('Tablette 1')));
    expect(readStationKey()).toBe('cle-tablette');
    expect(panel().getByText(text.pairedOn('19/10/2026'))).toBeInTheDocument();
  });

  it('switches a station off', async () => {
    const api = await mount({
      'GET /stations': ok({ items: [TABLET] }),
      [`PATCH /stations/${TABLET.id}`]: ok({ ...TABLET, isActive: false }),
    });
    const box = await panel().findByRole('checkbox', { name: `${text.active} : Tablette 1` });
    fireEvent.click(box);
    await waitFor(() => expect(box).not.toBeChecked());
    expect(api.callsTo(`PATCH /stations/${TABLET.id}`)[0]?.body).toEqual({ isActive: false });
    expect(panel().getByRole('button', { name: `${text.pair} : Tablette 1` })).toBeDisabled();
  });
});
