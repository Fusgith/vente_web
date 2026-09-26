import type { Customer } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { CustomerPicker } from './CustomerPicker.js';
import type { DraftCustomer } from './draft.js';

const text = labels.sales.customer;

const RAKOTO: Customer = {
  id: '8d0f4a52-6c1e-4f7e-9d7a-2b1c3d4e5f60',
  name: 'Rakoto Jean',
  phone: '0341234567',
  isActive: true,
  mergedIntoId: null,
};
const RABE: Customer = {
  ...RAKOTO,
  id: '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d',
  name: 'Rabe',
  phone: '0331112233',
};

/** The picker with its value held, as the quote holds it. */
function Harness({ initial = null }: { initial?: DraftCustomer | null }) {
  const [customer, setCustomer] = useState(initial);
  return <CustomerPicker value={customer} onChange={setCustomer} />;
}

const searchBox = () => screen.getByRole('searchbox', { name: text.search });
const openSheet = () => fireEvent.click(screen.getByRole('button', { name: text.choose }));
const type = (value: string) => fireEvent.change(searchBox(), { target: { value } });

describe('CustomerPicker (RG-DEV-04)', () => {
  it('finds a customer by phone and puts it on the quote', async () => {
    const api = fakeApi({ 'GET /customers?q=034+12': ok({ items: [RAKOTO, RABE], more: false }) });
    render(<Harness />);
    openSheet();
    expect(searchBox()).toHaveFocus();

    type('03');
    type('034 12');
    fireEvent.click(await screen.findByRole('button', { name: /Rakoto Jean/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: text.change('Rakoto Jean') });
    expect(trigger).toHaveTextContent('034 12 345 67');
    // Two digits are not searched: one request, for the whole number typed.
    expect(api.calls.map((call) => call.path)).toEqual(['/customers?q=034+12']);
  });

  it('asks to refine beyond 8 customers', async () => {
    fakeApi({ 'GET /customers?q=ra': ok({ items: [RABE, RAKOTO], more: true }) });
    render(<Harness />);
    openSheet();
    type('ra');
    expect(await screen.findByText(text.refine)).toBeInTheDocument();
  });

  it('creates the customer from the number searched in vain', async () => {
    const api = fakeApi({
      'GET /customers?q=032+44+555+66': ok({ items: [], more: false }),
      'POST /customers': (body) => ({
        status: 201,
        body: { ...RAKOTO, id: RABE.id, ...(body as object), phone: '0324455566' },
      }),
    });
    render(<Harness />);
    openSheet();
    type('032 44 555 66');
    expect(await screen.findByText(text.noResult)).toBeInTheDocument();
    expect(screen.getByLabelText(text.phone)).toHaveValue('032 44 555 66');

    fireEvent.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text.nameRequired);

    fireEvent.change(screen.getByLabelText(text.name), { target: { value: 'Randria  Paul ' } });
    fireEvent.click(screen.getByRole('button', { name: text.save }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.callsTo('POST /customers')[0]?.body).toEqual({
      name: 'Randria Paul',
      phone: '0324455566',
    });
    expect(screen.getByRole('button', { name: text.change('Randria Paul') })).toBeInTheDocument();
  });

  it('refuses an invalid phone before asking the server', () => {
    const api = fakeApi({});
    render(<Harness />);
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: text.newCustomer }));
    fireEvent.change(screen.getByLabelText(text.name), { target: { value: 'Rabe' } });
    fireEvent.change(screen.getByLabelText(text.phone), { target: { value: '034 12' } });
    fireEvent.click(screen.getByRole('button', { name: text.save }));
    expect(screen.getByRole('alert')).toHaveTextContent(text.phoneInvalid);
    expect(api.calls).toEqual([]);
  });

  it('offers the known customer instead of a duplicate phone', async () => {
    fakeApi({
      'POST /customers': apiError(409, 'CUSTOMER_PHONE_TAKEN', { customer: RAKOTO }),
    });
    render(<Harness />);
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: text.newCustomer }));
    fireEvent.change(screen.getByLabelText(text.name), { target: { value: 'Jean R.' } });
    fireEvent.change(screen.getByLabelText(text.phone), { target: { value: '+261 34 12 345 67' } });
    fireEvent.click(screen.getByRole('button', { name: text.save }));

    expect(await screen.findByRole('alert')).toHaveTextContent(text.taken('Rakoto Jean'));
    fireEvent.click(screen.getByRole('button', { name: text.pick('Rakoto Jean') }));
    expect(screen.getByRole('button', { name: text.change('Rakoto Jean') })).toBeInTheDocument();
  });

  it('keeps the chosen customer marked when searching again', async () => {
    fakeApi({ 'GET /customers?q=rakoto': ok({ items: [RAKOTO], more: false }) });
    render(<Harness initial={RAKOTO} />);
    fireEvent.click(screen.getByRole('button', { name: text.change('Rakoto Jean') }));
    type('rakoto');
    const sheet = screen.getByRole('dialog');
    const row = await within(sheet).findByRole('button', { name: /Rakoto Jean/ });
    expect(row.querySelector('svg')).not.toBeNull();
  });
});
