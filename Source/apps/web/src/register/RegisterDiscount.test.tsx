import { formatMga, type Order } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok } from '../test/fake-api.js';
import { requestOf } from '../test/requests.js';
import { RegisterWorkspace } from './RegisterWorkspace.js';
import { atMyRegister, item, OPENED, orderWithLines, queueOf } from './test-queue.js';

const text = labels.register;
const shown = (value: string) => value.replace(/\s/g, ' ');

const entry = atMyRegister(item(1));
const ORDER = `/orders/${entry.orderId}`;
const DISCOUNTS = `POST ${ORDER}/discounts`;

/** The soap at its 5 % cap, the nails (19 500 MGA, cap 15 %) without discount: 2 925 MGA left. */
const order = (overrides: Partial<Order> = {}): Order => ({
  ...orderWithLines(entry),
  ...overrides,
});

function mount(current: Order, handlers: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    ...OPENED,
    'GET /queues/register': ok(queueOf([item(2)], [entry])),
    [`GET ${ORDER}`]: ok(current),
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
const press = (sheet: HTMLElement, ...keys: string[]) => {
  for (const key of keys) fireEvent.click(within(sheet).getByRole('button', { name: key }));
};
const open = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.getByRole('dialog', { name });
};

describe('register: discounts within the caps, without the owner (T-089, H61)', () => {
  it('on a line: its cap shown first, a key beyond refused, the total brought down', async () => {
    // 2 000 MGA off the total; 10 % on the nails leaves it 975 MGA of headroom (H23).
    const api = mount(order({ orderDiscount: '2000.00', total: '112500.00' }), {
      [DISCOUNTS]: ok(order({ version: 3, orderDiscount: '975.00', total: '111575.00' })),
    });
    const sheet = await open(text.lineDiscount(2));
    expect(sheet).toHaveTextContent(shown(text.discountMaxCap('15', formatMga('2925'))));

    press(sheet, '1', '6');
    expect(within(sheet).getByRole('alert')).toHaveTextContent(
      shown(text.discountBeyond(formatMga('2925'))),
    );
    press(sheet, '0', text.applyDiscount);

    await waitFor(() =>
      expect(band()).toHaveTextContent(
        shown(text.discountApplied(2) + text.totalLowered(formatMga('975'))),
      ),
    );
    expect(api.callsTo(DISCOUNTS)[0]!.body).toEqual({
      version: 2,
      lines: [{ position: 2, discount: { kind: 'pct', value: '10' } }],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('on the total: bounded by the headroom the lines leave, in MGA', async () => {
    const api = mount(order(), {
      [DISCOUNTS]: ok(order({ version: 3, orderDiscount: '300.00', total: '114200.00' })),
    });
    const sheet = await open(text.totalDiscount);
    expect(sheet).toHaveTextContent(shown(text.discountMax(formatMga('2925'))));

    fireEvent.click(within(sheet).getByRole('button', { name: labels.sales.discount.inAmount }));
    press(sheet, '3', '0', '0', '0');
    expect(within(sheet).getByRole('alert')).toBeInTheDocument();
    press(sheet, text.applyDiscount);

    await waitFor(() => expect(band()).toHaveTextContent(text.discountApplied(null)));
    expect(api.callsTo(DISCOUNTS)[0]!.body).toEqual({
      version: 2,
      lines: [],
      orderDiscount: { kind: 'amount', value: '300' },
    });
  });

  it('removes a line discount', async () => {
    const api = mount(order(), {
      [DISCOUNTS]: ok(order({ version: 3, subtotal: '119500.00', total: '119500.00' })),
    });
    const sheet = await open(text.lineDiscount(1));
    press(sheet, text.removeDiscount);
    await waitFor(() => expect(api.callsTo(DISCOUNTS)).toHaveLength(1));
    expect(api.callsTo(DISCOUNTS)[0]!.body).toEqual({
      version: 2,
      lines: [{ position: 1, discount: null }],
    });
    expect(band()).toHaveTextContent(text.discountRemoved(1));
  });

  it('waits for the owner while a request is pending', async () => {
    const soap = { id: '0192a4f0-0000-7000-8000-000000000101', sku: 'SAV-001', name: 'Savon' };
    mount(order({ version: 3, discountRequest: requestOf(soap) }));
    expect(await screen.findByRole('button', { name: text.lineDiscount(1) })).toBeDisabled();
    expect(screen.getByRole('button', { name: text.totalDiscount })).toBeDisabled();
  });
});
