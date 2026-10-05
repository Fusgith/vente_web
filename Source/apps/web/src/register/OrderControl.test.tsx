import { ERROR_LABELS, formatMga } from '@vente-web/shared';
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
const shown = (value: string) => value.replace(/\s/g, ' ');

const entry = atMyRegister(item(1));
const ORDER = `/orders/${entry.orderId}`;

function mount(handlers: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    ...OPENED,
    'GET /queues/register': ok(queueOf([item(2)], [entry])),
    [`GET ${ORDER}`]: ok(orderWithLines(entry)),
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
const bandAlert = () => within(screen.getByRole('contentinfo')).getByRole('alert');
const control = () => screen.findByRole('region', { name: text.orderTitle(entry.number) });
const press = (sheet: HTMLElement, ...keys: string[]) => {
  for (const key of keys) fireEvent.click(within(sheet).getByRole('button', { name: key }));
};

describe('register: the order checked before payment (T-050, §5.6)', () => {
  it('shows the lines as a table, each discount with its origin, and the totals', async () => {
    mount();
    const region = await control();
    const rows = within(region).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('SAV-001');
    expect(rows[0]).toHaveTextContent(`5 % · ${text.withinCap}`);
    expect(within(region).getByRole('columnheader', { name: 'Montant net (MGA)' })).toBeVisible();
    expect(region).toHaveTextContent(shown(formatMga('114500')));
  });

  it('lowers a quantity on the pad, never raises it (RG-CMD-05b)', async () => {
    const lowered = { ...orderWithLines(entry, 3), total: '66500.00' };
    const api = mount({ [`POST ${ORDER}/adjust`]: ok(lowered) });
    fireEvent.click(await screen.findByRole('button', { name: text.modifyLine(1) }));
    const sheet = screen.getByRole('dialog', { name: text.adjustTitle(1) });
    const confirm = within(sheet).getByRole('button', { name: text.confirmQty });

    press(sheet, '5');
    expect(confirm).toBeDisabled();
    expect(sheet).toHaveTextContent(text.lowerOnly('4', 'paquet'));
    press(sheet, labels.sales.pad.erase, '2');
    fireEvent.click(confirm);

    await waitFor(() => expect(band()).toHaveTextContent(text.adjusted(1)));
    expect(api.callsTo(`POST ${ORDER}/adjust`)[0]!.body).toEqual({
      version: 2,
      changes: [{ position: 1, qty: '2' }],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('removes a line, but never the last one', async () => {
    const api = mount({ [`POST ${ORDER}/adjust`]: ok(orderWithLines(entry, 3)) });
    fireEvent.click(await screen.findByRole('button', { name: text.modifyLine(2) }));
    fireEvent.click(screen.getByRole('button', { name: text.removeLine }));
    await waitFor(() => expect(band()).toHaveTextContent(text.removed(2)));
    expect(api.callsTo(`POST ${ORDER}/adjust`)[0]!.body).toMatchObject({
      changes: [{ position: 2, qty: null }],
    });
  });

  it('keeps the last line: the order is cancelled instead', async () => {
    const single = orderWithLines(entry);
    mount({ [`GET ${ORDER}`]: ok({ ...single, lines: single.lines.slice(0, 1) }) });
    fireEvent.click(await screen.findByRole('button', { name: text.modifyLine(1) }));
    expect(screen.getByRole('button', { name: text.removeLine })).toBeDisabled();
    expect(screen.getByText(text.lastLine)).toBeVisible();
  });

  it('cancels with a reason, which is required (RG-ANN-01)', async () => {
    const api = mount({
      [`POST ${ORDER}/cancel`]: ok({ ...orderWithLines(entry, 3), status: 'CANCELLED' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.cancelOrder }));
    const sheet = screen.getByRole('dialog', { name: text.cancelTitle('A1', 'Rasoa Hanta') });
    const confirm = within(sheet).getByRole('button', { name: text.cancelOrder });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText(text.cancelReason), {
      target: { value: '  Le client renonce ' },
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(band()).toHaveTextContent(text.cancelled('A1', 'Rasoa Hanta')));
    expect(api.callsTo(`POST ${ORDER}/cancel`)[0]!.body).toEqual({
      version: 2,
      reason: 'Le client renonce',
    });
  });

  it('sends the order back to its salesperson in one click (RG-CMD-05b, H56)', async () => {
    const api = mount({
      [`POST ${ORDER}/send-back`]: ok({ ...orderWithLines(entry, 3), status: 'DRAFT' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.sendBack }));
    await waitFor(() => expect(band()).toHaveTextContent(text.sentBack('A1', 'Rasoa Hanta')));
    expect(api.callsTo(`POST ${ORDER}/send-back`)[0]!.body).toEqual({ version: 2 });
    expect(api.callsTo('GET /queues/register').length).toBeGreaterThan(1);
  });

  it('keeps the sheet on its article when another line is removed elsewhere', async () => {
    const api = mount();
    fireEvent.click(await screen.findByRole('button', { name: text.modifyLine(2) }));
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('queue.changed')?.size).toBeGreaterThan(0),
    );
    // The manager removed the soap: the nails come first.
    const [, nails] = orderWithLines(entry).lines;
    api.on(
      `GET ${ORDER}`,
      ok({ ...orderWithLines(entry, 3), lines: [{ ...nails!, position: 1 }] }),
    );
    act(() =>
      fakeRealtime.emit('queue.changed', {
        queue: 'register',
        orderId: entry.orderId,
        change: 'updated',
      }),
    );
    const sheet = await screen.findByRole('dialog', { name: text.adjustTitle(1) });
    expect(sheet).toHaveTextContent('CLO-001');
    expect(sheet).not.toHaveTextContent('SAV-001');
  });

  it('keeps a paying article: a change leaving the order at 0,00 MGA is refused (H50)', async () => {
    mount({ [`POST ${ORDER}/adjust`]: apiError(422, 'ORDER_TOTAL_ZERO') });
    fireEvent.click(await screen.findByRole('button', { name: text.modifyLine(2) }));
    fireEvent.click(screen.getByRole('button', { name: text.removeLine }));
    await waitFor(() =>
      expect(bandAlert()).toHaveTextContent(shown(ERROR_LABELS.ORDER_TOTAL_ZERO)),
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('reloads the order changed meanwhile elsewhere', async () => {
    const api = mount({ [`POST ${ORDER}/adjust`]: apiError(409, 'ORDER_CHANGED') });
    fireEvent.click(await screen.findByRole('button', { name: text.modifyLine(2) }));
    fireEvent.click(screen.getByRole('button', { name: text.removeLine }));
    await waitFor(() => expect(bandAlert()).toHaveTextContent(ERROR_LABELS.ORDER_CHANGED));
    await waitFor(() => expect(api.callsTo(`GET ${ORDER}`).length).toBeGreaterThan(1));
  });
});
