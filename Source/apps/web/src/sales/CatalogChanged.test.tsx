import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { ProductSearch } from './ProductSearch.js';
import { RIZ, SAVON } from './test-hits.js';

const FAVORITES = 'GET /products/favorites';

describe('tablet catalogue kept current (T-019b, RG-ART-07)', () => {
  it('reads the best sellers again when the catalogue changes', async () => {
    const api = fakeApi({
      'GET /categories': ok({ items: [] }),
      [FAVORITES]: ok({ items: [SAVON], promoted: [] }),
    });
    render(
      <RealtimeProvider me={meFor({ user: RIJA, activeRole: 'sales' })}>
        <StatusLineProvider>
          <ProductSearch onAdd={() => undefined} />
        </StatusLineProvider>
      </RealtimeProvider>,
    );
    expect(await screen.findByText(SAVON.name)).toBeVisible();

    api.on(FAVORITES, ok({ items: [SAVON, RIZ], promoted: [] }));
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('catalog.changed')?.size).toBe(1),
    );
    act(() => fakeRealtime.emit('catalog.changed', {}));

    expect(await screen.findByText(RIZ.name)).toBeVisible();
    expect(api.callsTo(FAVORITES)).toHaveLength(2);
    expect(screen.getByRole('heading', { name: labels.sales.favorites })).toBeVisible();
  });
});
