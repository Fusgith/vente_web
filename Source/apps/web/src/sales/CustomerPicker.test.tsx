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
  secondPhone: null,
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
    const searches = api.calls.filter((call) => call.path.startsWith('/customers?'));
    expect(searches.map((call) => call.path)).toEqual(['/customers?q=034+12']);
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
      'POST /customers': apiError(409, 'CUSTOMER_PHONE_TAKEN', {
        customer: RAKOTO,
        phone: '0341234567',
      }),
    });
    render(<Harness />);
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: text.newCustomer }));
    fireEvent.change(screen.getByLabelText(text.name), { target: { value: 'Jean R.' } });
    fireEvent.change(screen.getByLabelText(text.phone), { target: { value: '+261 34 12 345 67' } });
    fireEvent.click(screen.getByRole('button', { name: text.save }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      text.taken('034 12 345 67', 'Rakoto Jean'),
    );
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

  it('takes an optional second phone, and shows both numbers (decision H26)', async () => {
    const withTwo = { ...RABE, secondPhone: '0324455566' };
    const api = fakeApi({
      'GET /customers?q=rabe': ok({ items: [withTwo], more: false }),
      'POST /customers': { status: 201, body: withTwo },
    });
    render(<Harness />);
    openSheet();
    type('rabe');
    const row = await screen.findByRole('button', { name: /Rabe/ });
    expect(row).toHaveTextContent('033 11 122 33');
    expect(row).toHaveTextContent('032 44 555 66');

    fireEvent.click(screen.getByRole('button', { name: text.newCustomer }));
    fireEvent.change(screen.getByLabelText(text.phone), { target: { value: '033 11 122 33' } });
    fireEvent.change(screen.getByLabelText(text.secondPhone), {
      target: { value: '033 11 122 33' },
    });
    fireEvent.click(screen.getByRole('button', { name: text.save }));
    expect(screen.getByRole('alert')).toHaveTextContent(text.phonesSame);

    fireEvent.change(screen.getByLabelText(text.secondPhone), {
      target: { value: '+261 32 44 555 66' },
    });
    fireEvent.click(screen.getByRole('button', { name: text.save }));
    await waitFor(() => expect(api.callsTo('POST /customers')).toHaveLength(1));
    // The name comes from the search typed, as for any new customer.
    expect(api.callsTo('POST /customers')[0]!.body).toEqual({
      name: 'rabe',
      phone: '0331112233',
      secondPhone: '0324455566',
    });
  });

  it('shows the chosen customer’s last purchase, the lines on demand (H47)', async () => {
    fakeApi({
      [`GET /customers/${RAKOTO.id}/purchases`]: ok({
        lines: [
          { at: '2026-09-12T08:00:00.000Z', name: 'Clous 70 mm', unitLabel: 'kg', qty: '2.50' },
          { at: '2026-08-30T08:00:00.000Z', name: 'Riz blanc', unitLabel: 'sac', qty: '1.00' },
        ],
      }),
      [`GET /customers/${RABE.id}/purchases`]: ok({ lines: [] }),
    });
    const { unmount } = render(<Harness initial={RAKOTO} />);
    fireEvent.click(await screen.findByRole('button', { name: text.lastPurchase('12/09/2026') }));
    const sheet = screen.getByRole('dialog', { name: text.purchasesTitle('Rakoto Jean') });
    expect(within(sheet).getAllByRole('row')).toHaveLength(3);
    expect(within(sheet).getByText('Clous 70 mm')).toBeVisible();
    expect(within(sheet).getByText('2,5')).toBeVisible();
    expect(within(sheet).getByText('30/08/2026')).toBeVisible();
    unmount();

    render(<Harness initial={RABE} />);
    expect(await screen.findByText(text.noPurchase)).toBeVisible();
  });

  it('shows nothing of the history when the server cannot answer', async () => {
    const api = fakeApi({});
    render(<Harness initial={RAKOTO} />);
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(text.noPurchase)).not.toBeInTheDocument();
  });
});
