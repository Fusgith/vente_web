import { ERROR_LABELS } from '@vente-web/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { labels } from '../labels.js';
import { apiError, DIRECTORY, fakeApi, HERY, meFor, ok, RIJA } from '../test/fake-api.js';

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

  it('returns to the login screen with the reason when the session is gone', async () => {
    fakeApi({
      'GET /auth/me': ok(meFor({ user: HERY, activeRole: 'manager' })),
      'POST /auth/switch-role': apiError(401, 'AUTH_SESSION_IDLE'),
      'GET /auth/users': ok(DIRECTORY),
    });
    render(<App />);

    fireEvent.change(await screen.findByRole('combobox', { name: labels.shell.activeRole }), {
      target: { value: 'cashier' },
    });

    expect(await screen.findByText(ERROR_LABELS.AUTH_SESSION_IDLE)).toBeVisible();
    // Same person, same tablet: only the PIN is asked again.
    expect(await screen.findByRole('heading', { name: HERY.fullName })).toBeVisible();
  });

  it('signs out', async () => {
    const api = fakeApi({
      'GET /auth/me': ok(meFor({ user: RIJA, activeRole: 'sales' })),
      'POST /auth/logout': { status: 204 },
      'GET /auth/users': ok(DIRECTORY),
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: labels.shell.signOut }));

    expect(await screen.findByRole('button', { name: /Rija Rakoto/ })).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.callsTo('POST /auth/logout')).toHaveLength(1);
  });

  it('keeps the server session alive on activity, then locks after the idle delay (RG-USR-03)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = fakeApi({
      'GET /auth/me': ok(meFor({ user: RIJA, activeRole: 'sales', idleMinutes: 5 })),
      'POST /auth/logout': { status: 204 },
      'GET /auth/users': ok(DIRECTORY),
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
    expect(screen.getByRole('heading', { name: RIJA.fullName })).toBeVisible();
  });
});
