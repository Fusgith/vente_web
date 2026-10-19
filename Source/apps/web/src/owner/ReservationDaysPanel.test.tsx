import type { Customer, ReservationDays } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { ReservationDaysPanel } from './ReservationDaysPanel.js';

const text = labels.reservation;

const RASOA = '0192a4f0-0000-7000-8000-000000000401';
const LIST = 'GET /reservation-days';
const rasoa: Customer = {
  id: RASOA,
  name: 'Rasoa Hanta',
  phone: '0341122233',
  secondPhone: null,
  category: 'Particulier',
  type: 'INDIVIDUAL',
  isActive: true,
  mergedIntoId: null,
};
const durations = (days: number, own: number | null): ReservationDays => ({
  days,
  customers:
    own === null ? [] : [{ id: RASOA, name: 'Rasoa Hanta', phone: '0341122233', days: own }],
});

async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: { ...RIJA, roles: ['owner'] }, activeRole: 'owner' })}>
      <StatusLineProvider>
        <Frame workspace="owner" name={labels.workspaces.owner.title}>
          <ReservationDaysPanel />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

describe('the reservation duration, set by the admin and the owner (RG-STK-02, H45)', () => {
  it('sets the general duration, and refuses a part of a day', async () => {
    const api = await mount({ [LIST]: ok(durations(0, null)) });
    const field = await panel().findByRole('textbox', { name: text.generalField });
    expect(field).toHaveValue('0');
    expect(panel().getByText(text.none)).toBeInTheDocument();
    const save = panel().getByRole('button', { name: text.save });
    expect(save).toBeDisabled();

    fireEvent.change(field, { target: { value: '1,5' } });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(save).toBeDisabled();

    fireEvent.change(field, { target: { value: '2' } });
    api.on('PUT /reservation-days', ok(durations(2, null)));
    fireEvent.click(save);

    await waitFor(() => expect(band()).toHaveTextContent(text.generalSaved(2)));
    expect(api.callsTo('PUT /reservation-days')[0]!.body).toEqual({ days: 2 });
    await waitFor(() => expect(save).toBeDisabled());
  });

  it('finds a customer and gives them their own duration, then the general one back', async () => {
    const api = await mount({
      [LIST]: ok(durations(1, null)),
      'GET /customers?q=rasoa': ok({ items: [rasoa], more: false }),
      [`PUT /customers/${RASOA}/reservation-days`]: ok(durations(1, 5)),
    });
    fireEvent.change(await panel().findByRole('searchbox', { name: text.search }), {
      target: { value: 'rasoa' },
    });
    fireEvent.click(panel().getByRole('button', { name: text.searchGo }));
    fireEvent.click(await panel().findByRole('button', { name: text.giveOf('Rasoa Hanta') }));
    fireEvent.change(panel().getByRole('textbox', { name: text.daysOf('Rasoa Hanta') }), {
      target: { value: '5' },
    });
    fireEvent.click(panel().getByRole('button', { name: text.saveOf('Rasoa Hanta') }));

    await waitFor(() => expect(band()).toHaveTextContent(text.saved('Rasoa Hanta', 5)));
    const row = await panel().findByRole('row', { name: /Rasoa Hanta/ });
    expect(row).toHaveTextContent('034 11 222 33');
    expect(within(row).getByRole('textbox')).toHaveValue('5');

    api.on(`PUT /customers/${RASOA}/reservation-days`, ok(durations(1, null)));
    fireEvent.click(panel().getByRole('button', { name: text.removeOf('Rasoa Hanta') }));
    await waitFor(() => expect(band()).toHaveTextContent(text.saved('Rasoa Hanta', null)));
    expect(api.callsTo(`PUT /customers/${RASOA}/reservation-days`).map((c) => c.body)).toEqual([
      { days: 5 },
      { days: null },
    ]);
    expect(panel().getByText(text.none)).toBeInTheDocument();
  });
});
