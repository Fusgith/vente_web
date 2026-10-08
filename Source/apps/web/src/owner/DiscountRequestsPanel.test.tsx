import { ERROR_LABELS, formatMga, type DiscountRequest } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { ID, item, orderWithLines } from '../register/test-queue.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, HERY, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { REQUEST_ID, requestOf } from '../test/requests.js';
import { DiscountRequestsPanel } from './DiscountRequestsPanel.js';

const text = labels.requests.board;
const SOAP = { id: '0192a4f0-0000-7000-8000-000000000101', sku: 'SAV-001', name: 'Savon 400 g' };
const TOTAL_ITEM = '0192a4f0-0000-7000-8000-000000000603';
const LIST = 'GET /discount-requests';
const GRANT = `POST /discount-requests/${REQUEST_ID}/grant`;
const REJECT = `POST /discount-requests/${REQUEST_ID}/reject`;
/** The cells' text, its non-breaking spaces as plain ones. */
const shown = (value: string) => value.replace(/\s/g, ' ');
const OWNER = { ...RIJA, id: '0192a4f0-0000-7000-8000-000000000009', fullName: 'Naivo Boss' };

/** Rija asks 12 % on the soap and 5 000 MGA off the total of Rasoa's order, at the register. */
function request(overrides: Partial<DiscountRequest> = {}): DiscountRequest {
  const summary = requestOf(SOAP, { note: 'Fête de quartier' });
  return {
    ...summary,
    items: [
      ...summary.items,
      {
        id: TOTAL_ITEM,
        product: null,
        requested: { kind: 'amount', value: '5000.00' },
        granted: null,
      },
    ],
    decidedBy: null,
    withdrawnBy: null,
    code: null,
    order: orderWithLines(item(1)),
    ...overrides,
  };
}

const granted = request({
  status: 'GRANTED',
  closedAt: '2026-10-03T07:10:00.000Z',
  decidedBy: { id: OWNER.id, fullName: OWNER.fullName },
  code: 'R7K4-29QP',
});

/** Rabe Paul's order, the same asked: a second card. */
function another(): DiscountRequest {
  const asked = request({
    id: '0192a4f0-0000-7000-8000-000000000611',
    order: orderWithLines(item(2)),
  });
  return {
    ...asked,
    items: asked.items.map((one, n) => ({ ...one, id: `0192a4f0-0000-7000-8000-00000000062${n}` })),
  };
}

async function mount(handlers: Parameters<typeof fakeApi>[0], editable = true) {
  const api = fakeApi(handlers);
  const me = editable
    ? meFor({ user: { ...OWNER, roles: ['owner'] }, activeRole: 'owner' })
    : meFor({ user: HERY, activeRole: 'manager' });
  render(
    <RealtimeProvider me={me}>
      <StatusLineProvider>
        <Frame workspace={me.session.activeRole} name={labels.workspaces.owner.title}>
          <DiscountRequestsPanel editable={editable} />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const card = () => within(panel().getByRole('article', { name: text.of('Rasoa Hanta') }));

describe('DiscountRequestsPanel — the owner answers (T-033c, RG-REM-03, H53)', () => {
  it('shows who asks what, for whom and why, the order’s lines under it', async () => {
    await mount({ [LIST]: ok({ pending: [request()], recent: [] }) });

    expect(await panel().findByRole('article', { name: text.of('Rasoa Hanta') })).toBeVisible();
    expect(card().getByText(text.by(RIJA.fullName, '10:00'))).toBeVisible();
    expect(card().getByText(text.order('D-2026-000041'))).toBeVisible();
    expect(card().getByText(requestOf(SOAP).reason)).toBeVisible();
    expect(card().getByText('Fête de quartier')).toBeVisible();
    const lines = within(card().getByRole('table', { name: text.lines }));
    expect(lines.getByText('Clous 5 cm')).toBeVisible();
    expect(lines.getByText('114 500,00')).toBeVisible();
    const asked = within(card().getByRole('table', { name: labels.requests.wanted }));
    expect(asked.getByText('12 %')).toBeVisible();
    expect(asked.getByText(shown(formatMga('5000.00')))).toBeVisible();
    expect(panel().getByText(text.recentEmpty)).toBeVisible();
  });

  it('grants the soap as asked and the total at another value, applied without a code (H64)', async () => {
    const api = await mount({
      [LIST]: ok({ pending: [request()], recent: [] }),
      [GRANT]: ok(granted),
    });
    await panel().findByRole('article');

    const total = within(card().getByRole('group', { name: text.answerOf(labels.requests.total) }));
    fireEvent.click(total.getByRole('radio', { name: text.answers.other }));
    const value = card().getByRole('textbox', { name: text.grantOf(labels.requests.total) });
    expect(value).toHaveValue('5000,00');
    fireEvent.change(value, { target: { value: '3 000' } });
    fireEvent.click(card().getByRole('button', { name: text.grant }));

    const number = granted.order.number;
    await waitFor(() => expect(band()).toHaveTextContent(text.granted('Rasoa Hanta', number)));
    expect(api.callsTo(GRANT)[0]!.body).toEqual({
      items: [
        { itemId: requestOf(SOAP).items[0]!.id, discount: { kind: 'pct', value: '12.00' } },
        { itemId: TOTAL_ITEM, discount: { kind: 'amount', value: '3000' } },
      ],
    });
    const applied = panel().getByText(text.appliedTo(number));
    expect(panel().queryByText('R7K4-29QP')).toBeNull();
    // The card gone with its button, the focus goes to the order granted. An effect moves it once
    // the band is shown: on a loaded machine, React runs it a slice later.
    await waitFor(() => expect(applied).toHaveFocus());
    expect(panel().queryByRole('article')).toBeNull();
    expect(panel().getByText(text.pendingEmpty)).toBeVisible();
    const recent = within(panel().getByRole('table', { name: text.recent }));
    expect(
      recent.getByText(`${text.status.GRANTED} ${text.closedBy(OWNER.fullName)}`),
    ).toBeVisible();
    expect(recent.getByText(number)).toBeVisible();
  });

  it('grants nothing without one element at least, nor an invalid other value', async () => {
    const api = await mount({ [LIST]: ok({ pending: [request()], recent: [] }) });
    await panel().findByRole('article');

    const soap = within(card().getByRole('group', { name: text.answerOf('SAV-001 Savon 400 g') }));
    const total = within(card().getByRole('group', { name: text.answerOf(labels.requests.total) }));
    fireEvent.click(soap.getByRole('radio', { name: text.answers.none }));
    fireEvent.click(total.getByRole('radio', { name: text.answers.none }));
    fireEvent.click(card().getByRole('button', { name: text.grant }));
    expect(card().getByRole('alert')).toHaveTextContent(text.nothingGranted);

    fireEvent.click(total.getByRole('radio', { name: text.answers.other }));
    fireEvent.change(card().getByRole('textbox', { name: text.grantOf(labels.requests.total) }), {
      target: { value: '0' },
    });
    fireEvent.click(card().getByRole('button', { name: text.grant }));
    expect(card().getByRole('alert')).toHaveTextContent(text.otherInvalid);
    expect(api.callsTo(GRANT)).toHaveLength(0);
  });

  it('refuses in one gesture', async () => {
    const rejected = request({
      status: 'REJECTED',
      closedAt: '2026-10-03T07:10:00.000Z',
      decidedBy: { id: OWNER.id, fullName: OWNER.fullName },
    });
    const api = await mount({
      [LIST]: ok({ pending: [request()], recent: [] }),
      [REJECT]: ok(rejected),
    });
    await panel().findByRole('article');

    fireEvent.click(card().getByRole('button', { name: text.reject }));

    await waitFor(() => expect(band()).toHaveTextContent(text.rejected('Rasoa Hanta')));
    expect(api.callsTo(REJECT)).toHaveLength(1);
    expect(panel().queryByText(text.appliedTo(granted.order.number))).toBeNull();
    expect(panel().getByText(text.pendingEmpty)).toBeVisible();
    // Moved by an effect after the band is shown, as for the order granted.
    await waitFor(() => expect(panel().getByRole('heading', { name: text.pending })).toHaveFocus());
  });

  it('waits on each decision in its own card', async () => {
    await mount({
      [LIST]: ok({ pending: [request(), another()], recent: [] }),
      [GRANT]: () => new Promise(() => undefined),
    });
    await panel().findByRole('article', { name: text.of('Rasoa Hanta') });

    fireEvent.click(card().getByRole('button', { name: text.grant }));

    expect(await card().findByRole('button', { name: text.granting })).toBeDisabled();
    const other = within(panel().getByRole('article', { name: text.of('Rabe Paul') }));
    expect(other.getByRole('button', { name: text.grant })).toBeEnabled();
    expect(other.getByRole('button', { name: text.reject })).toBeEnabled();
  });

  it('reads again when the order of a card changes, not another', async () => {
    const api = await mount({ [LIST]: ok({ pending: [request()], recent: [] }) });
    await panel().findByRole('article');
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('queue.changed')?.size).toBeGreaterThan(0),
    );
    const reads = api.callsTo(LIST).length;

    act(() =>
      fakeRealtime.emit('queue.changed', { queue: 'register', orderId: ID(2), change: 'updated' }),
    );
    expect(api.callsTo(LIST)).toHaveLength(reads);
    act(() =>
      fakeRealtime.emit('order.status_changed', {
        orderId: request().order.id,
        status: 'CANCELLED',
      }),
    );

    await waitFor(() => expect(api.callsTo(LIST)).toHaveLength(reads + 1));
  });

  it('reads the list again when the request was withdrawn meanwhile', async () => {
    const withdrawn = request({
      status: 'WITHDRAWN',
      closedAt: '2026-10-03T07:08:00.000Z',
      withdrawnBy: { id: RIJA.id, fullName: RIJA.fullName },
    });
    let reads = 0;
    const api = await mount({
      [LIST]: () =>
        ok(
          reads++ === 0
            ? { pending: [request()], recent: [] }
            : { pending: [], recent: [withdrawn] },
        ),
      [GRANT]: apiError(409, 'DISCOUNT_REQUEST_NOT_PENDING'),
    });
    await panel().findByRole('article');

    fireEvent.click(card().getByRole('button', { name: text.grant }));

    await waitFor(() => expect(panel().queryByRole('article')).toBeNull());
    expect(api.callsTo(GRANT)).toHaveLength(1);
    expect(panel().getByRole('alert')).toHaveTextContent(ERROR_LABELS.DISCOUNT_REQUEST_NOT_PENDING);
    expect(
      panel().getByText(`${text.status.WITHDRAWN} ${text.closedBy(RIJA.fullName)}`),
    ).toBeVisible();
  });

  it('tells a new request as it arrives', async () => {
    let reads = 0;
    await mount({
      [LIST]: () =>
        ok(reads++ === 0 ? { pending: [], recent: [] } : { pending: [request()], recent: [] }),
    });
    expect(await panel().findByText(text.pendingEmpty)).toBeVisible();
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('discount.request_created')?.size).toBe(1),
    );

    act(() =>
      fakeRealtime.emit('discount.request_created', {
        requestId: REQUEST_ID,
        orderId: request().order.id,
      }),
    );

    expect(await panel().findByRole('article')).toBeVisible();
    expect(band()).toHaveTextContent(text.arrived('Rasoa Hanta'));
  });
});

describe('DiscountRequestsPanel — the manager reads (RG-DSH-05, H54)', () => {
  it('shows the requests without a way to answer them', async () => {
    const soapOnly = {
      ...granted,
      items: granted.items.map((one, n) =>
        n === 0 ? { ...one, granted: { kind: 'pct' as const, value: '12.00' } } : one,
      ),
    };
    await mount({ [LIST]: ok({ pending: [request()], recent: [soapOnly] }) }, false);

    expect(await panel().findByRole('article')).toBeVisible();
    expect(panel().getByText(text.readOnly)).toBeVisible();
    expect(panel().queryByRole('button', { name: text.grant })).toBeNull();
    expect(panel().queryByRole('radio')).toBeNull();
    const recent = within(panel().getByRole('table', { name: text.recent }));
    // The order it went on, never its code (H64).
    expect(recent.getByText(granted.order.number)).toBeVisible();
    expect(recent.queryByText('R7K4-29QP')).toBeNull();
    // What was granted, the element left out said so.
    expect(
      recent.getByText(
        `SAV-001 Savon 400 g : 12 % ; ${labels.requests.total} : ${text.answers.none}`,
      ),
    ).toBeVisible();
  });

  it('tells the manager a new request as it arrives (H51)', async () => {
    let reads = 0;
    await mount(
      {
        [LIST]: () =>
          ok(reads++ === 0 ? { pending: [], recent: [] } : { pending: [request()], recent: [] }),
      },
      false,
    );
    expect(await panel().findByText(text.pendingEmpty)).toBeVisible();
    await waitFor(() =>
      expect(fakeRealtime.sockets[0]?.listeners.get('discount.request_created')?.size).toBe(1),
    );

    act(() =>
      fakeRealtime.emit('discount.request_created', {
        requestId: REQUEST_ID,
        orderId: request().order.id,
      }),
    );

    expect(await panel().findByRole('article')).toBeVisible();
    expect(band()).toHaveTextContent(text.arrived('Rasoa Hanta'));
  });
});
