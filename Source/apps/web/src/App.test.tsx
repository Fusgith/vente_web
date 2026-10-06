import { ERROR_LABELS } from '@vente-web/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';
import { labels } from './labels.js';
import { apiError, fakeApi, HERY, meFor, ok, RIJA } from './test/fake-api.js';

const NOT_SIGNED_IN = apiError(401, 'AUTH_REQUIRED');

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('login: identifier and password, nothing else (RG-USR-02, RG-USR-03, H57)', () => {
  it('opens the account’s own space, with no name list, PIN or role to choose', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'POST /auth/login': ok(meFor({ user: HERY, activeRole: 'cashier', authMethod: 'PASSWORD' })),
    });
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(labels.appName);
    expect(screen.getByText(labels.login.instruction)).toBeVisible();
    const username = await screen.findByLabelText(labels.login.username);
    expect(username).toHaveFocus();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(labels.login.totp)).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: labels.login.signIn });
    expect(submit).toBeDisabled();

    fill(labels.login.username, ' hery ');
    fill(labels.login.password, 'correct horse');
    fireEvent.click(submit);

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.cashier.title }),
    ).toBeVisible();
    expect(api.callsTo('POST /auth/login')[0]?.body).toEqual({
      username: 'hery',
      password: 'correct horse',
    });
  });

  it('clears the password on failure and tells how long a lock lasts (RG-USR-05)', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'POST /auth/login': apiError(401, 'AUTH_INVALID_CREDENTIALS'),
    });
    render(<App />);

    await screen.findByLabelText(labels.login.username);
    fill(labels.login.username, 'rija');
    fill(labels.login.password, 'wrong one');
    fireEvent.click(screen.getByRole('button', { name: labels.login.signIn }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.AUTH_INVALID_CREDENTIALS,
    );
    expect(screen.getByLabelText(labels.login.username)).toHaveValue('rija');
    expect(screen.getByLabelText(labels.login.password)).toHaveValue('');

    api.on('POST /auth/login', apiError(423, 'AUTH_LOCKED', { retryAfterSeconds: 570 }));
    fill(labels.login.password, 'wrong again');
    fireEvent.click(screen.getByRole('button', { name: labels.login.signIn }));
    expect(await screen.findByText(labels.errors.lockedFor(10))).toBeVisible();
  });

  it('asks for a new password when the admin set the current one (H20)', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'POST /auth/login': apiError(403, 'AUTH_PASSWORD_CHANGE_REQUIRED'),
    });
    render(<App />);

    await screen.findByLabelText(labels.login.username);
    fill(labels.login.username, 'adm2');
    fill(labels.login.password, 'Given-by-adm1!');
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
      password: 'Given-by-adm1!',
      newPassword: 'Mine-only-42!',
    });
  });

  it('lets the owner choose their password with the admin’s code, then log in (RG-USR-10)', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'POST /auth/activate': apiError(400, 'ACTIVATION_INVALID'),
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: labels.login.activationLink }));
    const activate = screen.getByRole('button', { name: labels.login.activate });
    fill(labels.login.username, 'boss ');
    fill(labels.login.activationCode, 'WRONG');
    fill(labels.login.newPassword, 'short');
    expect(activate).toBeDisabled();
    fill(labels.login.newPassword, 'Mine-only-42!');
    fireEvent.click(activate);
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_LABELS.ACTIVATION_INVALID);
    expect(screen.getByLabelText(labels.login.activationCode)).toHaveValue('');

    api.on('POST /auth/activate', { status: 204 });
    fill(labels.login.activationCode, ' K7P2M9QX4R8T ');
    fireEvent.click(activate);
    expect(await screen.findByText(labels.login.activated)).toBeVisible();
    expect(api.callsTo('POST /auth/activate')[1]?.body).toEqual({
      username: 'boss',
      code: 'K7P2M9QX4R8T',
      password: 'Mine-only-42!',
    });
    expect(screen.getByLabelText(labels.login.username)).toHaveValue('boss');
    expect(screen.getByLabelText(labels.login.password)).toHaveValue('');
  });

  it('says why the server is unreachable, and the form stays usable', async () => {
    fakeApi({ 'GET /auth/me': 'network' });
    render(<App />);

    expect(await screen.findByText(labels.errors.NETWORK_ERROR)).toBeVisible();
    expect(screen.getByLabelText(labels.login.username)).toBeVisible();
  });
});

describe('login from outside the shop (RG-USR-04)', () => {
  it('asks for the TOTP code once the API requires it, keeping the password', async () => {
    const api = fakeApi({
      'GET /auth/me': NOT_SIGNED_IN,
      'POST /auth/login': apiError(401, 'AUTH_TOTP_REQUIRED'),
    });
    render(<App />);

    await screen.findByLabelText(labels.login.username);
    fill(labels.login.username, 'boss');
    fill(labels.login.password, 'long passphrase');
    fireEvent.click(screen.getByRole('button', { name: labels.login.signIn }));

    // Not a mistake: a note, no error, the password kept, the code field focused.
    const code = await screen.findByLabelText(labels.login.totp);
    expect(code).toHaveFocus();
    expect(screen.getByText(labels.login.remoteNotice)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(labels.login.password)).toHaveValue('long passphrase');
    const submit = screen.getByRole('button', { name: labels.login.signIn });
    expect(submit).toBeDisabled();

    api.on(
      'POST /auth/login',
      ok(
        meFor({
          user: { ...RIJA, username: 'boss', fullName: 'Le Boss', roles: ['owner'] },
          activeRole: 'owner',
          authMethod: 'PASSWORD_TOTP',
          origin: 'REMOTE',
        }),
      ),
    );
    fireEvent.change(code, { target: { value: '12 34 56' } });
    fireEvent.click(submit);

    expect(
      await screen.findByRole('heading', { name: labels.workspaces.owner.title }),
    ).toBeVisible();
    expect(screen.getByText(labels.shell.remote)).toBeVisible();
    expect(api.callsTo('POST /auth/login')[1]?.body).toEqual({
      username: 'boss',
      password: 'long passphrase',
      totp: '123456',
    });
  });
});
