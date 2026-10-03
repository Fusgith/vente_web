import { type Order } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { REASONS, REQUEST_ID, requestOf } from '../test/requests.js';
import { RegisterWorkspace } from './RegisterWorkspace.js';
import { atMyRegister, item, OPENED, orderWithLines, queueOf } from './test-queue.js';

const text = labels.requests;
const register = labels.register;

const entry = atMyRegister(item(1));
const ORDER = `/orders/${entry.orderId}`;
const CREATE = 'POST /discount-requests';
const WITHDRAW = `POST /discount-requests/${REQUEST_ID}/withdraw`;
const SET_ASIDE = `POST ${ORDER}/set-aside`;
const SOAP = {
  id: '0192a4f0-0000-7000-8000-000000000101',
  sku: 'SAV-001',
  name: 'Savon de Marseille 400 g',
};

/** The order at the register, its request to the owner as given (none by default). */
const withRequest = (version: number, request: Order['discountRequest'] = null): Order => ({
  ...orderWithLines(entry, version),
  discountRequest: request,
});
const pending = () => withRequest(3, requestOf(SOAP));

/** Granted: 12 % on the soap as the owner's code, applied to the order at once (H53). */
function granted(): Order {
  const order = withRequest(
    4,
    requestOf(SOAP, { status: 'GRANTED', closedAt: '2026-10-03T07:05:00.000Z' }),
  );
  return {
    ...order,
    discountCode: {
      code: 'R7K4-29QP',
      items: [{ productId: SOAP.id, discount: { kind: 'pct', value: '12' } }],
    },
  };
}

function mount(handlers: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    ...OPENED,
    'GET /queues/register': ok(queueOf([item(2)], [entry])),
    [`GET ${ORDER}`]: ok(withRequest(2)),
    'GET /discount-requests/reasons': ok({ reasons: REASONS }),
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

const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const payButton = () => screen.getByRole('button', { name: register.pay });

/** 12 % on the soap, a reason: sent from the sheet. */
async function askTwelvePercent() {
  fireEvent.click(await screen.findByRole('button', { name: text.ask }));
  const sheet = screen.getByRole('dialog', { name: text.title });
  await waitFor(() => expect(within(sheet).getByLabelText(text.reason)).toBeEnabled());
  fireEvent.change(within(sheet).getByLabelText(text.wantedOf(SOAP.name)), {
    target: { value: '12' },
  });
  fireEvent.change(within(sheet).getByLabelText(text.reason), { target: { value: REASONS[0] } });
  fireEvent.click(within(sheet).getByRole('button', { name: text.send }));
  return sheet;
}

describe('register: a discount asked of the owner (T-033d, H51, H52)', () => {
  it('sends the request from the order; the payment and the code then wait', async () => {
    const api = mount({ [CREATE]: ok(pending()) });
    await askTwelvePercent();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.callsTo(CREATE)[0]!.body).toEqual({
      orderId: entry.orderId,
      version: 2,
      items: [{ productId: SOAP.id, discount: { kind: 'pct', value: '12' } }],
      reason: REASONS[0],
      note: null,
    });
    expect(band()).toHaveTextContent(text.sent);
    // The button gone, the focus goes to the mark that took its place.
    expect(screen.getByText(text.atRegister).closest('[tabindex]')).toHaveFocus();
    expect(payButton()).toBeDisabled();
    expect(payButton()).toHaveAccessibleDescription(expect.stringContaining(text.atRegister));
    expect(screen.queryByRole('button', { name: labels.sales.code.open })).toBeNull();
    expect(screen.queryByRole('button', { name: text.ask })).toBeNull();
  });

  it('tells a request that went through although its answer was lost', async () => {
    let reads = 0;
    mount({
      [CREATE]: 'network',
      [`GET ${ORDER}`]: () => ok(reads++ === 0 ? withRequest(2) : pending()),
    });
    await askTwelvePercent();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(band()).toHaveTextContent(text.sent);
    expect(payButton()).toBeDisabled();
  });
});

describe('register: an order whose request awaits the owner (T-033d, RG-REM-05, H52, H54)', () => {
  it('withdraws the request with the customer’s agreement, then pays within the caps', async () => {
    const withdrawn = withRequest(
      4,
      requestOf(SOAP, { status: 'WITHDRAWN', closedAt: '2026-10-03T07:05:00.000Z' }),
    );
    const api = mount({ [`GET ${ORDER}`]: ok(pending()), [WITHDRAW]: ok(withdrawn) });
    expect(await screen.findByText(text.atRegister)).toBeVisible();
    expect(screen.getByText(text.withdrawHint)).toBeVisible();
    expect(payButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: text.withdraw }));

    await waitFor(() => expect(band()).toHaveTextContent(text.withdrawn));
    expect(api.callsTo(WITHDRAW)).toHaveLength(1);
    expect(payButton()).toBeEnabled();
    expect(screen.queryByText(text.atRegister)).toBeNull();
    expect(screen.getByRole('button', { name: text.ask })).toBeVisible();
  });

  it('sets the order aside: back in the queue at its place, its mark on', async () => {
    let aside = false;
    const api = mount({
      [`GET ${ORDER}`]: ok(pending()),
      'GET /queues/register': () =>
        ok(
          aside
            ? queueOf([{ ...item(1), discountPending: true }, item(2)])
            : queueOf([item(2)], [entry]),
        ),
      [SET_ASIDE]: () => {
        aside = true;
        return ok({ ...pending(), status: 'SUBMITTED' });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: text.setAside }));

    await waitFor(() => expect(band()).toHaveTextContent(text.setAsideDone('A1')));
    expect(api.callsTo(SET_ASIDE)).toHaveLength(1);
    const queue = within(
      await screen.findByRole('region', { name: new RegExp(register.queueTitle) }),
    );
    const row = queue.getByText('Rasoa Hanta').closest('tr')!;
    expect(within(row).getByText(text.tag)).toBeVisible();
    expect(queue.getAllByText(text.tag)).toHaveLength(1);
  });

  it('shows the owner’s answer as it comes: the code on, the payment free', async () => {
    let reads = 0;
    mount({ [`GET ${ORDER}`]: () => ok(reads++ === 0 ? pending() : granted()) });
    expect(await screen.findByText(text.atRegister)).toBeVisible();
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('queue.changed')?.size).toBeGreaterThan(0),
    );

    act(() =>
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: entry.orderId,
        change: 'updated',
      }),
    );

    await waitFor(() => expect(band()).toHaveTextContent(text.decided.GRANTED('R7K4-29QP')));
    expect(screen.getByText(labels.sales.code.tag('R7K4-29QP'))).toBeVisible();
    expect(payButton()).toBeEnabled();
  });

  it('reads the order again when the request was decided meanwhile', async () => {
    let reads = 0;
    mount({
      [`GET ${ORDER}`]: () => ok(reads++ === 0 ? pending() : granted()),
      [WITHDRAW]: apiError(409, 'DISCOUNT_REQUEST_NOT_PENDING'),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.withdraw }));

    await waitFor(() => expect(screen.getByText(labels.sales.code.tag('R7K4-29QP'))).toBeVisible());
    expect(payButton()).toBeEnabled();
  });
});

describe('register queue: the request’s mark (H52, RG-DSP-04)', () => {
  it('marks the order whose request awaits the owner', async () => {
    mount({
      'GET /queues/register': ok(queueOf([item(1), { ...item(2), discountPending: true }])),
    });
    const queue = within(
      await screen.findByRole('region', { name: new RegExp(register.queueTitle) }),
    );
    const row = (await queue.findByText('Rabe Paul')).closest('tr')!;
    expect(within(row).getByText(text.tag)).toBeVisible();
    expect(queue.getAllByText(text.tag)).toHaveLength(1);
  });

  it('names as next the first order the call takes, past the one awaiting the owner', async () => {
    mount({
      'GET /queues/register': ok(queueOf([{ ...item(1), discountPending: true }, item(2)])),
    });

    expect(await screen.findByText(register.next('A2', 'Rabe Paul'))).toBeVisible();
    expect(screen.getByRole('button', { name: register.callNext })).toBeEnabled();
  });

  it('tells the owner’s answer on an order set aside, by its ticket (H53)', async () => {
    mount({
      'GET /queues/register': ok(queueOf([{ ...item(1), discountPending: true }, item(2)])),
    });
    await screen.findByText(text.tag);
    await waitFor(() =>
      expect(
        fakeRealtime.sockets[0]?.listeners.get('discount.request_decided')?.size,
      ).toBeGreaterThan(0),
    );

    act(() =>
      fakeRealtime.emit('discount.request_decided', {
        requestId: REQUEST_ID,
        orderId: entry.orderId,
        status: 'GRANTED',
      }),
    );

    expect(band()).toHaveTextContent(text.decidedOrder('A1', 'Rasoa Hanta', 'GRANTED'));
  });
});
