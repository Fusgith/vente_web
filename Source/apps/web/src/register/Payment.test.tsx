import { formatMga } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { RegisterWorkspace } from './RegisterWorkspace.js';
import { atMyRegister, item, OPENED, orderWithLines, queueOf, SESSION } from './test-queue.js';

const text = labels.register;
const shown = (value: string) => value.replace(/\s/g, ' ');

const CASH = '0192a4f0-0000-7000-8000-000000000701';
const MVOLA = '0192a4f0-0000-7000-8000-000000000702';
const METHODS = {
  methods: [
    { id: CASH, code: 'CASH', label: 'Espèces', requiresReference: false },
    { id: MVOLA, code: 'MVOLA', label: 'MVola', requiresReference: true },
  ],
};

const INVOICE_ID = '0192a4f0-0000-7000-8000-000000000901';
const entry = atMyRegister(item(1));
const ORDER = `/orders/${entry.orderId}`;
const paid = (change: string) => ({
  order: { ...orderWithLines(entry, 3), status: 'PAID' },
  payment: {
    id: '0192a4f0-0000-7000-8000-000000000801',
    orderId: entry.orderId,
    totalDue: '114500.00',
    cashReceived: '120000.00',
    changeGiven: change,
    createdAt: '2026-09-28T06:00:00.000Z',
    lines: [],
  },
  invoice: { id: INVOICE_ID, number: 'F-2026-000001' },
});

function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: HERY, activeRole: 'cashier' })}>
      <StatusLineProvider>
        <Frame workspace="cashier" name={labels.workspaces.cashier.title}>
          <RegisterWorkspace userId={HERY.id} />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  return api;
}

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const atRegister = (handlers: Parameters<typeof fakeApi>[0] = {}) =>
  mount({
    ...OPENED,
    'GET /queues/register': ok(queueOf([], [entry])),
    [`GET ${ORDER}`]: ok(orderWithLines(entry)),
    'GET /payment-methods': ok(METHODS),
    ...handlers,
  });
async function paySheet() {
  fireEvent.click(await screen.findByRole('button', { name: text.pay }));
  const sheet = await screen.findByRole('dialog', { name: text.payTitle('A1', 'Rasoa Hanta') });
  await within(sheet).findByDisplayValue(shown('114 500'));
  return sheet;
}
const confirm = (sheet: HTMLElement) =>
  within(sheet).getByRole('button', { name: text.confirmPay(formatMga('114500')) });
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

describe('opening the register (RG-CAI-01/02, H32)', () => {
  it('asks for a register and its float before anyone is called', async () => {
    const api = mount({
      'GET /register-sessions/current': ok({ session: null }),
      'GET /register-sessions/stations': ok({
        stations: [
          { id: SESSION.station.id, name: 'Caisse 2', busy: false },
          { id: '0192a4f0-0000-7000-8000-000000000612', name: 'Caisse 1', busy: true },
        ],
      }),
      'GET /queues/register': ok(queueOf([item(1)])),
      'POST /register-sessions': { status: 201, body: SESSION },
    });
    const panel = await screen.findByRole('region', { name: text.openTitle });
    expect(screen.getByRole('button', { name: text.call('A1') })).toBeDisabled();
    expect(await within(panel).findByRole('button', { name: /Caisse 1/ })).toBeDisabled();
    // The only free register is chosen already; the float is typed as counted.
    expect(within(panel).getByRole('button', { name: 'Caisse 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    type(within(panel).getByLabelText(text.openingFloat), '50 000');
    fireEvent.click(within(panel).getByRole('button', { name: text.openRegister }));

    await waitFor(() => expect(band()).toHaveTextContent(text.opened('Caisse 2')));
    expect(api.callsTo('POST /register-sessions')[0]!.body).toEqual({
      stationId: SESSION.station.id,
      openingFloat: '50000',
    });
    expect(screen.getByText(text.sessionOf('Caisse 2', '08:02'))).toBeVisible();
    expect(screen.getByRole('button', { name: text.call('A1') })).toBeEnabled();
  });
});

describe('payment at the register (RG-PAY-01 à 04)', () => {
  it('takes cash for the whole amount and shows the change', async () => {
    const api = atRegister({ [`POST ${ORDER}/pay`]: ok(paid('5500.00')) });
    const sheet = await paySheet();
    type(within(sheet).getByLabelText(text.cashReceived), '120 000');
    // Paid, the customer leaves the register.
    api.on('GET /queues/register', ok(queueOf([], [])));
    expect(within(sheet).getByRole('status', { name: text.change })).toHaveTextContent(
      shown(formatMga('5500')),
    );
    fireEvent.click(confirm(sheet));

    await waitFor(() =>
      expect(band()).toHaveTextContent(
        text.paid('A1', 'Rasoa Hanta', 'F-2026-000001', shown(formatMga('5500'))),
      ),
    );
    // The invoice of the last payment stays at hand, to print (RG-FAC-04).
    const invoice = await screen.findByRole('link', { name: text.openInvoice });
    expect(invoice).toHaveAttribute('href', `/api/v1/invoices/${INVOICE_ID}/pdf`);
    expect(invoice).toHaveAttribute('target', '_blank');
    expect(screen.getByText(text.invoiceOf('F-2026-000001'))).toBeVisible();
    const [call] = api.callsTo(`POST ${ORDER}/pay`);
    expect(call!.body).toEqual({
      version: 2,
      lines: [{ methodId: CASH, amount: '114500', reference: null }],
      cashReceived: '120000',
    });
    expect(call!.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('splits between methods, the reference required, the total exact (RG-PAY-02/04)', async () => {
    const api = atRegister({ [`POST ${ORDER}/pay`]: ok(paid('0.00')) });
    const sheet = await paySheet();
    const [cash] = within(sheet).getAllByLabelText(text.lineAmount);
    type(cash!, '14 500');
    expect(sheet).toHaveTextContent(text.remaining);
    expect(confirm(sheet)).toBeDisabled();

    fireEvent.click(within(sheet).getByRole('button', { name: text.addMethod }));
    const amounts = within(sheet).getAllByLabelText(text.lineAmount);
    expect(shown((amounts[1] as HTMLInputElement).value)).toBe('100 000');
    expect(within(sheet).getAllByLabelText(text.method)[1]).toHaveValue(MVOLA);
    expect(confirm(sheet)).toBeDisabled();
    type(within(sheet).getByLabelText(text.reference), 'MP240928');
    expect(sheet).not.toHaveTextContent(text.remaining);
    fireEvent.click(confirm(sheet));

    await waitFor(() =>
      expect(band()).toHaveTextContent(text.paid('A1', 'Rasoa Hanta', 'F-2026-000001', null)),
    );
    expect(api.callsTo(`POST ${ORDER}/pay`)[0]!.body).toEqual({
      version: 2,
      lines: [
        { methodId: CASH, amount: '14500', reference: null },
        { methodId: MVOLA, amount: '100000', reference: 'MP240928' },
      ],
      cashReceived: null,
    });
  });

  it('sends the same payment again with the same key after a network failure', async () => {
    const api = atRegister({ [`POST ${ORDER}/pay`]: 'network' });
    const sheet = await paySheet();
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(api.callsTo(`POST ${ORDER}/pay`)).toHaveLength(1));
    api.on(`POST ${ORDER}/pay`, ok(paid('0.00')));
    await waitFor(() => expect(confirm(sheet)).toBeEnabled());
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(api.callsTo(`POST ${ORDER}/pay`)).toHaveLength(2));
    const [first, second] = api.callsTo(`POST ${ORDER}/pay`);
    expect(second!.headers['idempotency-key']).toBe(first!.headers['idempotency-key']);
  });
});
