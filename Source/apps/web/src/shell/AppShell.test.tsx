import { ERROR_LABELS } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { labels } from '../labels.js';
import { apiError, fakeApi, HERY, meFor, ok, RIJA } from '../test/fake-api.js';

/** Lets pending fetch promises settle while intervals and Date are faked (setTimeout stays real). */
const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('signed-in shell', () => {
  it('restores the session and switches role without a new login (RG-USR-02)', async () => {
    const api = fakeApi({
      'GET /auth/me': ok(meFor({ user: HERY, activeRole: 'manager' })),
      'POST /auth/switch-role': ok(meFor({ user: HERY, activeRole: 'cashier' })),
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.manager.title }),
    ).toBeVisible();
    expect(screen.getByText(HERY.fullName)).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: labels.shell.activeRole }), {
      target: { value: 'cashier' },
    });

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.cashier.title }),
    ).toBeVisible();
    expect(api.callsTo('POST /auth/switch-role')[0]?.body).toEqual({ role: 'cashier' });
  });

  it('says a refused role switch as an alert in the bottom band', async () => {
    fakeApi({
      'GET /auth/me': ok(meFor({ user: HERY, activeRole: 'manager' })),
      'POST /auth/switch-role': apiError(403, 'AUTH_ROLE_REMOTE_FORBIDDEN'),
      'GET /register-sessions': ok({ sessions: [] }),
      'GET /products?page=1': ok({ items: [], total: 0 }),
      'GET /audit': ok({ entries: [], more: false }),
      'GET /customers/categories': ok({ categories: ['Divers'] }),
      'GET /deliveries/issues': ok([]),
      'GET /stock/alerts': ok({ items: [] }),
      'GET /discount-caps': ok({ defaultPct: '0.00', categories: [] }),
      'GET /discount-rules': ok({ items: [] }),
      'GET /discount-requests': ok({ pending: [], recent: [] }),
      'GET /queues/register': ok({ queue: 'register', serving: [], waiting: [] }),
      'GET /queues/delivery': ok({ queue: 'delivery', serving: [], waiting: [] }),
      'GET /supervision/today': ok({
        registerWait: null,
        deliveryWait: null,
        inProgress: 0,
        paidUndelivered: { count: 0, total: '0.00' },
      }),
    });
    render(<App />);

    fireEvent.change(await screen.findByRole('combobox', { name: labels.shell.activeRole }), {
      target: { value: 'cashier' },
    });

    // The band's alert region is always there, empty until something goes wrong.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(ERROR_LABELS.AUTH_ROLE_REMOTE_FORBIDDEN),
    );
    expect(screen.getByRole('heading', { name: labels.workspaces.manager.title })).toBeVisible();
  });

  it('opens the owner’s screen on its title, the requests to answer right under it', async () => {
    fakeApi({
      'GET /auth/me': ok(meFor({ user: { ...RIJA, roles: ['owner'] }, activeRole: 'owner' })),
      'GET /discount-requests': ok({ pending: [], recent: [] }),
      'GET /register-sessions': ok({ sessions: [] }),
      'GET /products?page=1': ok({ items: [], total: 0 }),
      'GET /audit': ok({ entries: [], more: false }),
      'GET /discount-caps': ok({ defaultPct: '0.00', categories: [] }),
      'GET /discount-codes': ok({ items: [], defaultValidUntil: '2026-10-29' }),
      'GET /promotions': ok({ items: [] }),
      'GET /discount-rules': ok({ items: [] }),
      'GET /categories': ok({ items: [] }),
      'GET /customers/categories': ok({ categories: [] }),
    });
    render(<App />);

    const title = await screen.findByRole('heading', {
      level: 1,
      name: labels.workspaces.owner.title,
    });
    // A screen reader meets the page's title before the panels' own.
    const [first, second] = screen.getAllByRole('heading');
    expect(first).toBe(title);
    expect(second).toHaveTextContent(labels.requests.board.title);
  });

  it('returns to the login screen with the reason when the session is gone', async () => {
    fakeApi({
      'GET /auth/me': ok(meFor({ user: HERY, activeRole: 'manager' })),
      'POST /auth/switch-role': apiError(401, 'AUTH_SESSION_IDLE'),
    });
    render(<App />);

    fireEvent.change(await screen.findByRole('combobox', { name: labels.shell.activeRole }), {
      target: { value: 'cashier' },
    });

    expect(await screen.findByText(ERROR_LABELS.AUTH_SESSION_IDLE)).toBeVisible();
    // Same person, same tablet: the identifier is kept, only the password is asked again.
    expect(await screen.findByLabelText(labels.login.username)).toHaveValue(HERY.username);
    expect(screen.getByLabelText(labels.login.password)).toHaveFocus();
  });

  it('signs out', async () => {
    const api = fakeApi({
      'GET /auth/me': ok(meFor({ user: RIJA, activeRole: 'sales' })),
      'POST /auth/logout': { status: 204 },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: labels.shell.signOut }));

    expect(await screen.findByLabelText(labels.login.username)).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.callsTo('POST /auth/logout')).toHaveLength(1);
  });

  it('keeps the server session alive on activity, then locks after the idle delay (RG-USR-03)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = fakeApi({
      'GET /auth/me': ok(meFor({ user: RIJA, activeRole: 'sales', idleMinutes: 5 })),
      'POST /auth/logout': { status: 204 },
    });
    render(<App />);
    await settle();
    expect(screen.getByRole('heading', { name: labels.workspaces.sales.title })).toBeVisible();

    // Two minutes of reading, then a tap: one keep-alive request, and the delay restarts.
    act(() => vi.advanceTimersByTime(2 * 60_000));
    fireEvent.pointerDown(document.body);
    await settle();
    expect(api.callsTo('GET /auth/me')).toHaveLength(2);

    act(() => vi.advanceTimersByTime(4 * 60_000));
    expect(screen.getByRole('heading', { name: labels.workspaces.sales.title })).toBeVisible();
    act(() => vi.advanceTimersByTime(60_000));
    await settle();

    expect(screen.getByText(labels.session.locked(5))).toBeVisible();
    expect(api.callsTo('POST /auth/logout')).toHaveLength(1);
    expect(screen.getByLabelText(labels.login.username)).toHaveValue(RIJA.username);
  });
});
