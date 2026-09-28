import { formatMga, type SessionSummary } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RegisterSessionsPanel } from '../manager/RegisterSessionsPanel.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, HERY, meFor, ok, type FakeResponse } from '../test/fake-api.js';
import { RegisterWorkspace } from './RegisterWorkspace.js';
import { OPENED, queueOf, SESSION } from './test-queue.js';

const text = labels.closing;
const shown = (value: string) => value.replace(/\s/g, ' ');

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    ...SESSION,
    cashier: { id: HERY.id, fullName: HERY.fullName },
    closedAt: null,
    byMethod: [
      { code: 'CASH', label: 'Espèces', count: 3, total: '80000.00' },
      { code: 'MVOLA', label: 'MVola', count: 1, total: '45000.00' },
    ],
    refunds: [],
    cashExpected: '130000.00',
    countedCash: null,
    variance: null,
    note: null,
    forgotten: false,
    ...overrides,
  };
}

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

describe('closing the register (RG-CAI-03, H35)', () => {
  it('counts the cash, requires a comment on a variance, then shows the report', async () => {
    const closed = summary({
      closedAt: '2026-09-28T15:00:00.000Z',
      countedCash: '129500.00',
      variance: '-500.00',
      note: 'Billet manquant',
    });
    const api = mount({
      ...OPENED,
      'GET /queues/register': ok(queueOf([])),
      'GET /register-sessions/current/summary': ok({
        summary: summary({
          refunds: [{ code: 'CASH', label: 'Espèces', count: 1, total: '6500.00' }],
        }),
      }),
      'POST /register-sessions/current/close': ok(closed),
      'GET /register-sessions/stations': ok({ stations: [] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.close }));
    const sheet = await screen.findByRole('dialog', { name: text.closeTitle('Caisse 2') });
    expect(await within(sheet).findByText('MVola')).toBeVisible();
    expect(sheet).toHaveTextContent(shown(formatMga('130000')));
    expect(within(sheet).getByText(text.refunded('Espèces', 1))).toBeVisible();

    const counted = within(sheet).getByLabelText(text.counted);
    const confirm = within(sheet).getByRole('button', { name: text.confirm });
    fireEvent.change(counted, { target: { value: '130 000' } });
    expect(within(sheet).getByText(text.exact)).toBeVisible();
    expect(confirm).toBeEnabled();

    fireEvent.change(counted, { target: { value: '129 500' } });
    expect(within(sheet).getByRole('status', { name: text.variance })).toHaveTextContent(
      shown(formatMga('-500')),
    );
    expect(confirm).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText(text.noteRequired), {
      target: { value: 'Billet manquant' },
    });
    fireEvent.click(confirm);

    const report = await within(sheet).findByRole('link', { name: text.report });
    expect(report).toHaveAttribute('href', `/api/v1/register-sessions/${SESSION.id}/report`);
    expect(api.callsTo('POST /register-sessions/current/close')[0]!.body).toEqual({
      countedCash: '129500',
      note: 'Billet manquant',
    });
    // Closed: the register is to be opened again.
    fireEvent.click(within(sheet).getByRole('button', { name: text.done }));
    expect(await screen.findByRole('region', { name: labels.register.openTitle })).toBeVisible();
  });

  it('stays open while the close is on its way, then shows the report', async () => {
    let answer: (response: FakeResponse) => void = () => undefined;
    mount({
      ...OPENED,
      'GET /queues/register': ok(queueOf([])),
      'GET /register-sessions/current/summary': ok({ summary: summary() }),
      'POST /register-sessions/current/close': () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      'GET /register-sessions/stations': ok({ stations: [] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: text.close }));
    const sheet = await screen.findByRole('dialog', { name: text.closeTitle('Caisse 2') });
    await within(sheet).findByText('MVola');
    fireEvent.change(within(sheet).getByLabelText(text.counted), { target: { value: '130 000' } });
    fireEvent.click(within(sheet).getByRole('button', { name: text.confirm }));
    await within(sheet).findByRole('button', { name: text.closing });
    fireEvent.click(within(sheet).getByRole('button', { name: labels.register.close }));
    expect(sheet).toBeInTheDocument();

    answer(ok(summary({ closedAt: '2026-09-28T15:00:00.000Z', countedCash: '130000.00' })));
    expect(await within(sheet).findByRole('link', { name: text.report })).toBeVisible();
  });
});

describe('the day’s registers for the manager and the owner (RG-CAI-04/05)', () => {
  it('lists each session, the forgotten one flagged, the variance and the report', async () => {
    fakeApi({
      'GET /register-sessions': ok({
        sessions: [
          summary({ forgotten: true }),
          summary({
            id: '0192a4f0-0000-7000-8000-000000000602',
            closedAt: '2026-09-28T15:00:00.000Z',
            variance: '-500.00',
          }),
        ],
      }),
    });
    render(<RegisterSessionsPanel />);
    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(text.forgotten);
    expect(rows[1]).toHaveTextContent(text.closedAt('18:00'));
    expect(rows[1]).toHaveTextContent(shown('-500,00'));
    expect(rows[0]).toHaveTextContent(shown('125 000,00'));
    expect(within(rows[1]!).getByRole('link', { name: text.reportOf('Caisse 2') })).toHaveAttribute(
      'href',
      '/api/v1/register-sessions/0192a4f0-0000-7000-8000-000000000602/report',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: text.refresh })).toBeEnabled());
  });

  it('keeps the latest list when an earlier answer comes late', async () => {
    const answers: ((response: FakeResponse) => void)[] = [];
    fakeApi({
      'GET /register-sessions': () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    });
    render(<RegisterSessionsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: text.refresh }));
    await waitFor(() => expect(answers).toHaveLength(2));
    answers[1]!(ok({ sessions: [summary({ closedAt: '2026-09-28T15:00:00.000Z' })] }));
    expect(await screen.findByText(text.closedAt('18:00'))).toBeVisible();
    answers[0]!(ok({ sessions: [summary()] }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(text.closedAt('18:00'))).toBeVisible();
    expect(screen.queryByText(text.open)).toBeNull();
  });
});
