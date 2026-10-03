import { ERROR_LABELS, formatMga, type Order } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { RegisterWorkspace } from './RegisterWorkspace.js';
import { atMyRegister, item, OPENED, orderWithLines, queueOf } from './test-queue.js';

const text = labels.register;
const code = labels.sales.code;
const shown = (value: string) => value.replace(/\s/g, ' ');

const entry = atMyRegister(item(1));
const ORDER = `/orders/${entry.orderId}`;
const ATTACH = `POST ${ORDER}/discount-code`;
const SOAP = '0192a4f0-0000-7000-8000-000000000101';

/** The order once the code went on: 12 % on the soap, granted beyond its 5 % cap. */
function coded(before: Order = orderWithLines(entry)): Order {
  const [soap, nails] = before.lines;
  return {
    ...before,
    version: before.version + 1,
    lines: [
      {
        ...soap!,
        discountPct: '12.00',
        discountAmount: '12000.00',
        discountSource: 'CODE',
        net: '88000.00',
      },
      nails!,
    ],
    lineDiscounts: '12000.00',
    subtotal: '107500.00',
    discountTotal: '12000.00',
    total: '107500.00',
    discountCode: {
      code: 'R7K4-29QP',
      items: [{ productId: SOAP, discount: { kind: 'pct', value: '12' } }],
    },
  };
}

function mount(handlers: Parameters<typeof fakeApi>[0] = {}, order = orderWithLines(entry)) {
  const api = fakeApi({
    ...OPENED,
    'GET /queues/register': ok(queueOf([item(2)], [entry])),
    [`GET ${ORDER}`]: ok(order),
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

/** Opens the sheet from the order and types `typed`; the sheet is returned. */
async function typeCode(typed: string) {
  fireEvent.click(await screen.findByRole('button', { name: code.open }));
  const sheet = screen.getByRole('dialog', { name: code.title });
  fireEvent.change(within(sheet).getByLabelText(code.field), { target: { value: typed } });
  fireEvent.click(within(sheet).getByRole('button', { name: code.apply }));
  return sheet;
}

describe('register: the owner’s code typed before payment (T-034c, RG-CMD-05b, H42)', () => {
  it('applies the code to the order, its tag in the button’s place', async () => {
    const api = mount({ [ATTACH]: ok(coded()) });
    fireEvent.click(await screen.findByRole('button', { name: code.open }));
    // Said of the order, not of a quote.
    expect(screen.getByRole('dialog', { name: code.title })).toHaveTextContent(text.codeHint);
    fireEvent.click(screen.getByRole('button', { name: code.close }));

    await typeCode('r7k4 29qp');

    await waitFor(() => expect(band()).toHaveTextContent(text.codeAttached('R7K4-29QP')));
    expect(api.callsTo(ATTACH)[0]!.body).toEqual({ code: 'r7k4 29qp', version: 2 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: code.open })).toBeNull();
    expect(screen.getByText(code.tag('R7K4-29QP'))).toHaveFocus();
    const soap = screen.getAllByRole('row')[1]!;
    expect(soap).toHaveTextContent(`12 % · ${text.byCode}`);
    expect(screen.getByRole('region', { name: text.orderTitle(entry.number) })).toHaveTextContent(
      shown(formatMga('107500')),
    );
  });

  it('shows a refusal under the field, to correct the code there', async () => {
    mount({ [ATTACH]: apiError(409, 'DISCOUNT_CODE_OTHER_CUSTOMER') });
    const sheet = await typeCode('R7K4-29QP');

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.DISCOUNT_CODE_OTHER_CUSTOMER,
    );
    expect(screen.getByRole('button', { name: code.open })).toBeVisible();
  });

  it('keeps the code active when it would make the order free (H50)', async () => {
    mount({ [ATTACH]: apiError(422, 'DISCOUNT_CODE_FREE_ORDER') });
    const sheet = await typeCode('R7K4-29QP');

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      shown(ERROR_LABELS.DISCOUNT_CODE_FREE_ORDER),
    );
    expect(screen.queryByText(code.tag('R7K4-29QP'))).toBeNull();
  });

  it('finds the code on when its answer was lost on the Wi-Fi', async () => {
    const api = mount({ [ATTACH]: 'network' });
    await screen.findByRole('button', { name: code.open });
    api.on(`GET ${ORDER}`, ok(coded()));
    await typeCode('R7K4-29QP');

    await waitFor(() => expect(band()).toHaveTextContent(text.codeAttached('R7K4-29QP')));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(code.tag('R7K4-29QP'))).toBeVisible();
  });

  it('closes the sheet once the order read since carries the code typed', async () => {
    const api = mount({ [ATTACH]: 'network' });
    await screen.findByRole('button', { name: code.open });
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('queue.changed')?.size).toBeGreaterThan(0),
    );
    api.on(`GET ${ORDER}`, 'network');
    const sheet = await typeCode('R7K4-29QP');
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(labels.errors.NETWORK_ERROR);

    // Back on the Wi-Fi, the order is read again: the code went on.
    api.on(`GET ${ORDER}`, ok(coded()));
    act(() =>
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: entry.orderId,
        change: 'updated',
      }),
    );
    // The sheet belongs to the order without a code: the code on, it closes, its tag shown.
    expect(await screen.findByText(code.tag('R7K4-29QP'))).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.callsTo(ATTACH)).toHaveLength(1);
  });

  it('shows the order as it now is when it changed meanwhile, the code left to type again', async () => {
    const api = mount({ [ATTACH]: apiError(409, 'ORDER_CHANGED') });
    await screen.findByRole('button', { name: code.open });
    // The manager removed the nails meanwhile.
    const changed = orderWithLines(entry, 3);
    api.on(`GET ${ORDER}`, ok({ ...changed, lines: changed.lines.slice(0, 1) }));
    const sheet = await typeCode('R7K4-29QP');

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(ERROR_LABELS.ORDER_CHANGED);
    await waitFor(() => expect(screen.queryByText('CLO-001')).toBeNull());
  });

  it('says so when the total’s discount comes down to the headroom the code leaves', async () => {
    const discounted = { ...orderWithLines(entry), orderDiscount: '5000.00', total: '109500.00' };
    mount({ [ATTACH]: ok({ ...coded(discounted), orderDiscount: '975.00' }) }, discounted);
    await typeCode('R7K4-29QP');

    await waitFor(() =>
      expect(band()).toHaveTextContent(
        shown(text.codeAttachedLowered('R7K4-29QP', formatMga('975.00'))),
      ),
    );
  });

  it('shows the code already on the order, without the button', async () => {
    mount({}, coded());
    expect(await screen.findByText(code.tag('R7K4-29QP'))).toBeVisible();
    expect(screen.queryByRole('button', { name: code.open })).toBeNull();
  });
});
