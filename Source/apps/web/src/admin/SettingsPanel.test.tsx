import { SETTING_KEYS } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { SettingsPanel } from './SettingsPanel.js';

const text = labels.settings;
const READ = 'GET /settings';

const VALUES = {
  ...Object.fromEntries(SETTING_KEYS.map((key) => [key, null])),
  vat_rate: 20,
  cash_rounding: 'none',
  customer_categories: ['Divers', 'Régulier'],
};

async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: { ...RIJA, roles: ['admin'] }, activeRole: 'admin' })}>
      <StatusLineProvider>
        <Frame workspace="admin" name={labels.workspaces.admin.title}>
          <SettingsPanel />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const type = async (name: string, value: string) =>
  fireEvent.change(await panel().findByLabelText(name), { target: { value } });

describe('the admin’s settings (CDC métier §13, T-013)', () => {
  it('saves only what changed, a list one item per line', async () => {
    const api = await mount({
      [READ]: ok({ values: VALUES }),
      'PUT /settings/vat_rate': ok({ values: { ...VALUES, vat_rate: 18 } }),
      'PUT /settings/cash_rounding': ok({ values: { ...VALUES, cash_rounding: 100 } }),
      'PUT /settings/customer_categories': ok({ values: VALUES }),
    });
    await type(text.fields['vat_rate'] ?? '', '18');
    await type(text.fields['cash_rounding'] ?? '', '100');
    await type(text.fields['customer_categories'] ?? '', 'Divers\n\n Gros contrat ');
    fireEvent.click(panel().getByRole('button', { name: text.save }));

    await waitFor(() => expect(band()).toHaveTextContent(text.saved(3)));
    expect(api.callsTo('PUT /settings/vat_rate').map((call) => call.body)).toEqual([{ value: 18 }]);
    expect(api.callsTo('PUT /settings/cash_rounding').map((call) => call.body)).toEqual([
      { value: 100 },
    ]);
    expect(api.callsTo('PUT /settings/customer_categories').map((call) => call.body)).toEqual([
      { value: ['Divers', 'Gros contrat'] },
    ]);
    expect(api.callsTo('PUT /settings/quote_prefix')).toEqual([]);
  });

  it('names the setting the server refused', async () => {
    await mount({
      [READ]: ok({ values: VALUES }),
      'PUT /settings/vat_rate': apiError(400, 'VALIDATION_ERROR'),
    });
    await type(text.fields['vat_rate'] ?? '', '120');
    fireEvent.click(panel().getByRole('button', { name: text.save }));
    expect(await panel().findByRole('alert')).toHaveTextContent(text.fields['vat_rate'] ?? '');
  });
});
