import { ERROR_LABELS, formatMga, type InvoiceLookup } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { RegisterWorkspace } from './RegisterWorkspace.js';
import { item, OPENED, orderOf, queueOf } from './test-queue.js';

const text = labels.refund;
const shown = (value: string) => value.replace(/\s/g, ' ');

const CASH = '0192a4f0-0000-7000-8000-000000000701';
const MVOLA = '0192a4f0-0000-7000-8000-000000000702';
const METHODS = {
  methods: [
    { id: CASH, code: 'CASH', label: 'Espèces', requiresReference: false },
    { id: MVOLA, code: 'MVOLA', label: 'MVola', requiresReference: true },
  ],
};
const CREDIT_NOTE = '0192a4f0-0000-7000-8000-000000000951';
const MANAGER = '0192a4f0-0000-7000-8000-000000000952';
const entry = item(1);
const LOOKUP = 'GET /invoices/lookup?number=f-2026-000001';
const REFUND = `POST /orders/${entry.orderId}/refund`;

function sale(
  status: InvoiceLookup['order']['status'],
  creditNotes: InvoiceLookup['creditNotes'] = [],
): InvoiceLookup {
  return {
    invoice: {
      id: '0192a4f0-0000-7000-8000-000000000901',
      number: 'F-2026-000001',
      issuedAt: '2026-09-28T06:00:00.000Z',
    },
    order: { ...orderOf(entry), status, version: 4 },
    payment: {
      id: '0192a4f0-0000-7000-8000-000000000801',
      orderId: entry.orderId,
      totalDue: '65000.00',
      cashReceived: '65000.00',
      changeGiven: '0.00',
      createdAt: '2026-09-28T06:00:00.000Z',
      lines: [{ method: { code: 'CASH', label: 'Espèces' }, amount: '65000.00', reference: null }],
    },
    creditNotes,
  };
}

function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi({
    ...OPENED,
    'GET /queues/register': ok(queueOf([])),
    'GET /payment-methods': ok(METHODS),
    'GET /auth/users': ok({
      users: [
        {
          id: HERY.id,
          username: 'hery',
          fullName: 'Hery Caissier',
          roles: ['cashier', 'manager'],
        },
        {
          id: MANAGER,
          username: 'responsable',
          fullName: 'Rakoto Responsable',
          roles: ['manager'],
        },
        { id: CREDIT_NOTE, username: 'fara', fullName: 'Fara Responsable', roles: ['manager'] },
      ],
    }),
    ...handlers,
  });
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

async function find() {
  fireEvent.click(await screen.findByRole('button', { name: text.open }));
  const sheet = await screen.findByRole('dialog', { name: text.title });
  fireEvent.change(within(sheet).getByLabelText(text.invoiceNumber), {
    target: { value: 'f-2026-000001' },
  });
  fireEvent.click(within(sheet).getByRole('button', { name: text.find }));
  await within(sheet).findByRole('heading', { name: text.found('A1', 'Rasoa Hanta') });
  return sheet;
}

describe('cancelling a paid sale at the register (RG-ANN-02, ⚠️ H36)', () => {
  it('finds it by invoice, asks the manager’s PIN, then gives the credit note', async () => {
    const api = mount({
      [LOOKUP]: ok(sale('PAID')),
      [REFUND]: apiError(401, 'AUTH_INVALID_CREDENTIALS'),
    });
    const sheet = await find();
    const amount = formatMga('65000');
    expect(sheet).toHaveTextContent(shown(amount));
    const confirm = within(sheet).getByRole('button', { name: text.confirm(amount) });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(sheet).getByLabelText(text.reason), {
      target: { value: 'Le client renonce' },
    });
    // A method with a reference requires it; the one paid with comes first.
    const method = within(sheet).getByLabelText(text.method);
    expect(method).toHaveValue(CASH);
    fireEvent.change(method, { target: { value: MVOLA } });
    expect(within(sheet).getByLabelText(text.reference)).toBeVisible();
    fireEvent.change(method, { target: { value: CASH } });
    // Picked by name among the managers only, never the cashier refunding (annexe B).
    const manager = within(sheet).getByLabelText(text.manager);
    expect(
      within(manager)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([text.pickManager, 'Rakoto Responsable', 'Fara Responsable']);
    fireEvent.change(manager, { target: { value: 'responsable' } });
    const pin = within(sheet).getByLabelText(text.pin);
    fireEvent.change(pin, { target: { value: '9999' } });
    expect(confirm).toBeEnabled();

    // A wrong PIN: said, and typed again.
    fireEvent.click(confirm);
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.AUTH_INVALID_CREDENTIALS,
    );
    expect(pin).toHaveValue('');

    api.on(
      REFUND,
      ok({
        order: sale('REFUNDED').order,
        creditNote: { id: CREDIT_NOTE, number: 'AV-2026-000001' },
      }),
    );
    fireEvent.change(pin, { target: { value: '1234' } });
    fireEvent.click(confirm);
    const link = await within(sheet).findByRole('link', { name: text.openCreditNote });
    expect(link).toHaveAttribute('href', `/api/v1/credit-notes/${CREDIT_NOTE}/pdf`);
    expect(within(sheet).getByRole('status')).toHaveTextContent(
      shown(text.done('AV-2026-000001', amount, 'Espèces')),
    );
    expect(api.callsTo(REFUND)[1]!.body).toEqual({
      version: 4,
      reason: 'Le client renonce',
      refund: { methodId: CASH, reference: null },
      approval: { username: 'responsable', pin: '1234' },
    });
    const band = within(screen.getByRole('contentinfo')).getByRole('status');
    expect(band).toHaveTextContent(text.refunded('A1', 'Rasoa Hanta', 'AV-2026-000001'));

    fireEvent.click(within(sheet).getByRole('button', { name: text.finish }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says why a sale at the counter cannot be cancelled here', async () => {
    mount({ [LOOKUP]: ok(sale('PREPARING')) });
    const sheet = await find();
    expect(within(sheet).getByRole('status')).toHaveTextContent(text.notRefundable('PREPARING'));
    expect(text.notRefundable('PREPARING')).not.toBe(text.notRefundable('PAID'));
    expect(within(sheet).queryByLabelText(text.pin)).not.toBeInTheDocument();
  });

  it('reprints the credit note of a sale already refunded, when the reply was lost', async () => {
    const api = mount({
      [LOOKUP]: ok(sale('PAID')),
      [REFUND]: 'network',
    });
    const sheet = await find();
    fireEvent.change(within(sheet).getByLabelText(text.reason), {
      target: { value: 'Le client renonce' },
    });
    fireEvent.change(within(sheet).getByLabelText(text.manager), {
      target: { value: 'responsable' },
    });
    fireEvent.change(within(sheet).getByLabelText(text.pin), { target: { value: '1234' } });
    // The refund went through, its reply did not: the sale is looked up again.
    api.on(
      'GET /invoices/lookup?number=F-2026-000001',
      ok(sale('REFUNDED', [{ id: CREDIT_NOTE, number: 'AV-2026-000001' }])),
    );
    fireEvent.click(within(sheet).getByRole('button', { name: text.confirm(formatMga('65000')) }));
    const link = await within(sheet).findByRole('link', {
      name: text.creditNoteOf('AV-2026-000001'),
    });
    expect(link).toHaveAttribute('href', `/api/v1/credit-notes/${CREDIT_NOTE}/pdf`);
    expect(within(sheet).getByRole('status')).toHaveTextContent(text.notRefundable('REFUNDED'));
  });

  it('says so when no invoice has that number', async () => {
    mount({ [LOOKUP]: apiError(404, 'INVOICE_NOT_FOUND') });
    fireEvent.click(await screen.findByRole('button', { name: text.open }));
    const sheet = await screen.findByRole('dialog', { name: text.title });
    fireEvent.change(within(sheet).getByLabelText(text.invoiceNumber), {
      target: { value: 'f-2026-000001' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: text.find }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.INVOICE_NOT_FOUND,
    );
  });
});
