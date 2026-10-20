import type { KioskHome } from '@vente-web/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { KioskScreen } from './KioskScreen.js';

const KEY = 'BORNE-1';
const t = labels.kiosk;
const SOAP = '0192a4f0-0000-7000-8000-0000000000a1';
const PACK = '0192a4f0-0000-7000-8000-0000000000b1';

const home: KioskHome = {
  station: 'Borne entrée',
  idleSeconds: 120,
  favorites: [
    {
      id: SOAP,
      name: 'Savon Nosy',
      soldOut: false,
      units: [{ id: PACK, label: 'paquet', factor: '6', price: '25000.00' }],
    },
  ],
};

describe('self-service kiosk (T-036, RG-BOR-01 à 04)', () => {
  it('fills a basket without discount column and sends it with name and phone', async () => {
    const api = fakeApi({
      [`GET /kiosk/${KEY}`]: ok(home),
      [`POST /kiosk/${KEY}/baskets`]: { status: 201, body: { basket: 'P7' } },
    });
    render(<KioskScreen kioskKey={KEY} />);

    fireEvent.click(await screen.findByRole('button', { name: /paquet/ }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    const table = screen.getByRole('table');
    expect(within(table).queryByText(/Remise/)).not.toBeInTheDocument();
    // The line and the total: 3 × 25 000,00.
    expect(within(table).getAllByText('75 000,00')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: t.finish }));
    fireEvent.change(screen.getByLabelText(t.name), { target: { value: 'Rasoa Hanta' } });
    fireEvent.change(screen.getByLabelText(t.phone), { target: { value: '034 11 222 33' } });
    fireEvent.click(screen.getByRole('button', { name: t.send }));

    expect(await screen.findByText('P7')).toBeInTheDocument();
    expect(screen.getByText(t.sentCall)).toBeInTheDocument();
    expect(api.callsTo(`POST /kiosk/${KEY}/baskets`)[0]?.body).toEqual({
      name: 'Rasoa Hanta',
      phone: '034 11 222 33',
      lines: [{ productUnitId: PACK, qty: '3' }],
    });
  });

  it('says so when the key is unknown or the kiosk is off', async () => {
    fakeApi({ [`GET /kiosk/${KEY}`]: apiError(404, 'NOT_FOUND') });
    render(<KioskScreen kioskKey={KEY} />);
    expect(await screen.findByText(t.unknown)).toBeInTheDocument();
  });
});
