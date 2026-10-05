import { ERROR_LABELS } from '@vente-web/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';
import { labels } from './labels.js';
import { apiError, DIRECTORY, fakeApi, HERY, meFor, ok, RIJA } from './test/fake-api.js';

const NOT_SIGNED_IN = apiError(401, 'AUTH_REQUIRED');

function typeOnKeypad(digits: string) {
  for (const digit of digits) fireEvent.click(screen.getByRole('button', { name: digit }));
}

describe('login in the shop (RG-USR-03)', () => {
  it('signs in by tapping a name and typing the PIN', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'GET /auth/users': ok(DIRECTORY),
      'POST /auth/login': ok(meFor({ user: RIJA, activeRole: 'sales' })),
    });
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(labels.appName);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Rija Rakoto/ }));
    // A single role needs no choice.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    typeOnKeypad('1234');
    expect(screen.getByRole('status')).toHaveAccessibleName(labels.login.pinEntered(4));
    fireEvent.click(screen.getByRole('button', { name: labels.login.submit }));

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.sales.title }),
    ).toBeVisible();
    expect(api.callsTo('POST /auth/login')[0]?.body).toEqual({
      username: 'rija',
      role: 'sales',
      pin: '1234',
    });
  });

  it('moves the focus to the chosen name, and back to the tile on « Changer d’utilisateur »', async () => {
    fakeApi({ 'GET /auth/me': NOT_SIGNED_IN, 'GET /auth/users': ok(DIRECTORY) });
    render(<App />);

    const tile = await screen.findByRole('button', { name: /Rija Rakoto/ });
    fireEvent.click(tile);
    expect(screen.getByRole('heading', { name: RIJA.fullName })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: labels.login.otherUser }));
    expect(screen.getByRole('button', { name: /Rija Rakoto/ })).toHaveFocus();
  });

  it('asks a multi-role user for the role; the keyboard works too', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'GET /auth/users': ok(DIRECTORY),
      'POST /auth/login': ok(meFor({ user: HERY, activeRole: 'cashier' })),
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Hery Rabe/ }));
    for (const key of '5678') fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(labels.login.roleRequired);
    expect(api.callsTo('POST /auth/login')).toHaveLength(0);

    fireEvent.click(screen.getByRole('radio', { name: 'Caissier' }));
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.cashier.title }),
    ).toBeVisible();
    expect(api.callsTo('POST /auth/login')[0]?.body).toEqual({
      username: 'hery',
      role: 'cashier',
      pin: '5678',
    });
  });

  it('clears the PIN on failure and tells how long a lock lasts (RG-USR-05)', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'GET /auth/users': ok(DIRECTORY),
      'POST /auth/login': apiError(401, 'AUTH_INVALID_CREDENTIALS'),
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Rija Rakoto/ }));
    typeOnKeypad('0000');
    fireEvent.click(screen.getByRole('button', { name: labels.login.submit }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.AUTH_INVALID_CREDENTIALS,
    );
    expect(screen.getByRole('status')).toHaveAccessibleName(labels.login.pinEntered(0));

    api.on('POST /auth/login', apiError(423, 'AUTH_LOCKED', { retryAfterSeconds: 570 }));
    typeOnKeypad('1111');
    fireEvent.click(screen.getByRole('button', { name: labels.login.submit }));
    expect(await screen.findByText(labels.errors.lockedFor(10))).toBeVisible();
  });

  it('offers the password form, e.g. for the admin in the shop', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'GET /auth/users': ok(DIRECTORY),
      'POST /auth/login': ok(
        meFor({
          user: { ...RIJA, username: 'admin', fullName: 'Admin', roles: ['admin'] },
          activeRole: 'admin',
          authMethod: 'PASSWORD',
        }),
      ),
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: labels.login.passwordLink }));
    expect(screen.queryByLabelText(labels.login.totp)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(labels.login.username), { target: { value: 'admin ' } });
    fireEvent.change(screen.getByLabelText(labels.login.password), {
      target: { value: 'correct horse' },
    });
    fireEvent.click(screen.getByRole('button', { name: labels.login.signIn }));
    expect(screen.getByRole('alert')).toHaveTextContent(labels.login.roleRequired);

    fireEvent.click(screen.getByRole('radio', { name: 'Administrateur' }));
    fireEvent.click(screen.getByRole('button', { name: labels.login.signIn }));

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.admin.title }),
    ).toBeVisible();
    expect(api.callsTo('POST /auth/login')[0]?.body).toEqual({
      username: 'admin',
      role: 'admin',
      password: 'correct horse',
    });
  });

  it('asks for a new password when the admin set the current one (H20)', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'GET /auth/users': ok(DIRECTORY),
      'POST /auth/login': apiError(403, 'AUTH_PASSWORD_CHANGE_REQUIRED'),
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: labels.login.passwordLink }));
    fireEvent.change(screen.getByLabelText(labels.login.username), { target: { value: 'adm2' } });
    fireEvent.change(screen.getByLabelText(labels.login.password), {
      target: { value: 'Given-by-adm1!' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Administrateur' }));
    fireEvent.click(screen.getByRole('button', { name: labels.login.signIn }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.AUTH_PASSWORD_CHANGE_REQUIRED,
    );
    const fresh = screen.getByLabelText(labels.login.newPassword);
    expect(fresh).toHaveFocus();
    expect(screen.getByLabelText(labels.login.password)).toHaveValue('Given-by-adm1!');
    const submit = screen.getByRole('button', { name: labels.login.signIn });
    fireEvent.change(fresh, { target: { value: 'short' } });
    expect(submit).toBeDisabled();

    api.on(
      'POST /auth/login',
      ok(
        meFor({
          user: { ...RIJA, username: 'adm2', fullName: 'Admin', roles: ['admin'] },
          activeRole: 'admin',
          authMethod: 'PASSWORD',
        }),
      ),
    );
    fireEvent.change(fresh, { target: { value: 'Mine-only-42!' } });
    fireEvent.click(submit);
    expect(
      await screen.findByRole('heading', { name: labels.workspaces.admin.title }),
    ).toBeVisible();
    expect(api.callsTo('POST /auth/login')[1]?.body).toEqual({
      username: 'adm2',
      role: 'admin',
      password: 'Given-by-adm1!',
      newPassword: 'Mine-only-42!',
    });
  });

  it('shows why the server is unreachable and retries', async () => {
    const api = fakeApi({ 'GET /auth/me': 'network', 'GET /auth/users': 'network' });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(labels.errors.NETWORK_ERROR);
    api.on('GET /auth/users', ok(DIRECTORY));
    fireEvent.click(screen.getByRole('button', { name: labels.retry }));
    expect(await screen.findByRole('button', { name: /Rija Rakoto/ })).toBeVisible();
  });
});

describe('login from outside the shop (RG-USR-04)', () => {
  it('asks for password and TOTP, for the boss or the admin only', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'GET /auth/users': apiError(403, 'AUTH_LAN_ONLY'),
      'POST /auth/login': ok(
        meFor({
          user: { ...RIJA, username: 'boss', fullName: 'Le Boss', roles: ['owner'] },
          activeRole: 'owner',
          authMethod: 'PASSWORD_TOTP',
          origin: 'REMOTE',
        }),
      ),
    });
    render(<App />);

    expect(await screen.findByText(labels.login.remoteNotice)).toBeVisible();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Boss', 'Administrateur']);
    expect(screen.getByRole('radio', { name: 'Boss' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.change(screen.getByLabelText(labels.login.username), { target: { value: 'boss' } });
    fireEvent.change(screen.getByLabelText(labels.login.password), {
      target: { value: 'long passphrase' },
    });
    const submit = screen.getByRole('button', { name: labels.login.signIn });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(labels.login.totp), { target: { value: '12 34 56' } });
    fireEvent.click(submit);

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.owner.title }),
    ).toBeVisible();
    expect(screen.getByText(labels.shell.remote)).toBeVisible();
    expect(api.callsTo('POST /auth/login')[0]?.body).toEqual({
      username: 'boss',
      role: 'owner',
      password: 'long passphrase',
      totp: '123456',
    });
  });
});
