import { ERROR_LABELS, type UserAccount } from '@vente-web/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { AccountsPanel } from './AccountsPanel.js';

const text = labels.accounts;

const RIJA_ID = '0192a4f0-0000-7000-8000-000000000601';
const ADMIN_ID = '0192a4f0-0000-7000-8000-000000000602';
const LOVA_ID = '0192a4f0-0000-7000-8000-000000000603';
const BOSS_ID = '0192a4f0-0000-7000-8000-000000000604';
const NO_CONTENT = { status: 204 };

const account = (over: Partial<UserAccount>): UserAccount => ({
  id: RIJA_ID,
  username: 'rija',
  fullName: 'Rija Rakoto',
  roles: ['sales'],
  ticketLetter: 'A',
  isActive: true,
  hasPassword: true,
  passwordChangeRequired: false,
  totpEnabled: false,
  lockedUntil: null,
  ...over,
});
const RIJA = account({});
const ADMIN = account({
  id: ADMIN_ID,
  username: 'admin',
  fullName: 'Hery Admin',
  roles: ['admin'],
  ticketLetter: null,
  hasPassword: true,
  passwordChangeRequired: true,
  lockedUntil: '2999-01-01T00:00:00.000Z',
});

function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <StatusLineProvider>
      <Frame workspace="admin" name={labels.workspaces.admin.title}>
        <AccountsPanel />
      </Frame>
    </StatusLineProvider>,
  );
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
const rowOf = (username: string) => {
  const row = panel().getByRole('cell', { name: username }).closest('tr');
  if (!row) throw new Error(`no row for ${username}`);
  return within(row);
};

describe('AccountsPanel — the admin’s accounts (T-016e, annexe B, RG-USR-06)', () => {
  it('lists the accounts with their state and ways in, never a secret', async () => {
    mount({ 'GET /users': ok({ users: [RIJA, ADMIN] }) });

    await panel().findByRole('table', { name: text.list });
    expect(rowOf('rija').getByText(text.state.active)).toBeInTheDocument();
    expect(rowOf('rija').getByText(text.access.password)).toBeInTheDocument();
    expect(rowOf('admin').getByText(text.state.locked)).toBeInTheDocument();
    expect(rowOf('admin').getByText(text.access.passwordToChange)).toBeInTheDocument();
  });

  it('creates a sales account: the ticket letter is asked for a sales clerk only', async () => {
    const LOVA = account({
      id: LOVA_ID,
      username: 'lova',
      fullName: 'Lova Ranaivo',
      ticketLetter: 'B',
      hasPassword: false,
    });
    const api = mount({
      'GET /users': ok({ users: [RIJA] }),
      'POST /users': { status: 201, body: LOVA },
    });
    await panel().findByRole('table', { name: text.list });

    fireEvent.click(panel().getByRole('button', { name: text.add }));
    const form = within(panel().getByRole('form', { name: text.formNew }));
    const create = form.getByRole('button', { name: text.create });
    fireEvent.change(form.getByLabelText(text.username), { target: { value: ' lova ' } });
    fireEvent.change(form.getByLabelText(text.fullName), { target: { value: 'Lova Ranaivo' } });
    expect(create).toBeDisabled();
    expect(form.queryByLabelText(text.ticketLetter)).not.toBeInTheDocument();
    fireEvent.click(form.getByRole('checkbox', { name: 'Commercial' }));
    expect(create).toBeDisabled();
    fireEvent.change(form.getByLabelText(text.ticketLetter), { target: { value: 'b' } });
    fireEvent.click(create);

    expect(await panel().findByRole('cell', { name: 'lova' })).toBeInTheDocument();
    expect(panel().queryByRole('form')).not.toBeInTheDocument();
    expect(band()).toHaveTextContent(text.created('Lova Ranaivo'));
    expect(api.callsTo('POST /users')[0]?.body).toEqual({
      username: 'lova',
      fullName: 'Lova Ranaivo',
      roles: ['sales'],
      ticketLetter: 'B',
    });
  });

  it('sends only what changed, shows a refusal, and deactivates an account', async () => {
    const api = mount({
      'GET /users': ok({ users: [RIJA, ADMIN] }),
      [`PATCH /users/${ADMIN_ID}`]: apiError(409, 'LAST_ADMIN'),
      [`PATCH /users/${RIJA_ID}`]: ok({ ...RIJA, isActive: false }),
    });
    await panel().findByRole('table', { name: text.list });

    fireEvent.click(panel().getByRole('button', { name: text.edit('Hery Admin') }));
    let form = within(panel().getByRole('form', { name: text.formEdit('Hery Admin') }));
    const save = form.getByRole('button', { name: text.save });
    expect(save).toBeDisabled();
    fireEvent.click(form.getByRole('checkbox', { name: text.active }));
    fireEvent.click(save);
    expect(await form.findByRole('alert')).toHaveTextContent(ERROR_LABELS.LAST_ADMIN);
    expect(api.callsTo(`PATCH /users/${ADMIN_ID}`)[0]?.body).toEqual({ isActive: false });
    fireEvent.click(form.getByRole('button', { name: text.cancel }));

    fireEvent.click(panel().getByRole('button', { name: text.edit('Rija Rakoto') }));
    form = within(panel().getByRole('form', { name: text.formEdit('Rija Rakoto') }));
    fireEvent.click(form.getByRole('checkbox', { name: text.active }));
    fireEvent.click(form.getByRole('button', { name: text.save }));
    expect(await rowOf('rija').findByText(text.state.inactive)).toBeInTheDocument();
    expect(band()).toHaveTextContent(text.saved('Rija Rakoto'));
    expect(api.callsTo(`PATCH /users/${RIJA_ID}`)[0]?.body).toEqual({ isActive: false });
  });
});

describe('AccountsPanel — the ways in of an account (T-016f, H20, RG-USR-05)', () => {
  it('sets a password, lifts a lock, forgets the TOTP, closes the sessions (H57)', async () => {
    const LOCKED = { ...RIJA, lockedUntil: '2999-01-01T00:00:00.000Z', totpEnabled: true };
    const api = mount({
      'GET /users': ok({ users: [LOCKED] }),
      [`PUT /users/${RIJA_ID}/password`]: NO_CONTENT,
      [`POST /users/${RIJA_ID}/unlock`]: NO_CONTENT,
      [`DELETE /users/${RIJA_ID}/totp`]: NO_CONTENT,
      [`DELETE /users/${RIJA_ID}/sessions`]: NO_CONTENT,
    });
    await panel().findByRole('table', { name: text.list });
    fireEvent.click(panel().getByRole('button', { name: text.edit('Rija Rakoto') }));
    const ways = within(panel().getByRole('region', { name: text.secrets.title('Rija Rakoto') }));

    expect(ways.queryByText(/PIN/)).not.toBeInTheDocument();
    fireEvent.change(ways.getByLabelText(text.secrets.password), {
      target: { value: 'entree-magasin' },
    });
    fireEvent.click(ways.getByRole('button', { name: text.secrets.setPassword }));
    expect(await rowOf('rija').findByText(/Mot de passe à changer/)).toBeInTheDocument();
    expect(api.callsTo(`PUT /users/${RIJA_ID}/password`)[0]?.body).toEqual({
      password: 'entree-magasin',
    });

    fireEvent.click(ways.getByRole('button', { name: text.secrets.unlock }));
    expect(await rowOf('rija').findByText(text.state.active)).toBeInTheDocument();
    expect(ways.queryByRole('button', { name: text.secrets.unlock })).not.toBeInTheDocument();

    fireEvent.click(ways.getByRole('button', { name: text.secrets.resetTotp }));
    expect(
      await within(band()).findByText(text.secrets.totpReset('Rija Rakoto')),
    ).toBeInTheDocument();
    expect(ways.queryByRole('button', { name: text.secrets.resetTotp })).not.toBeInTheDocument();

    fireEvent.click(ways.getByRole('button', { name: text.secrets.closeSessions }));
    expect(
      await within(band()).findByText(text.secrets.sessionsClosed('Rija Rakoto')),
    ).toBeInTheDocument();
    expect(api.callsTo(`DELETE /users/${RIJA_ID}/sessions`)).toHaveLength(1);
  });

  it('hands the owner a one-time code, never a password set for them (RG-USR-10)', async () => {
    const BOSS = account({
      id: BOSS_ID,
      username: 'boss',
      fullName: 'Fara Boss',
      roles: ['owner'],
      ticketLetter: null,
      hasPassword: false,
    });
    mount({
      'GET /users': ok({ users: [BOSS] }),
      [`POST /users/${BOSS_ID}/activation-code`]: {
        status: 201,
        body: { code: 'K7P2M9QX4R8T', expiresAt: '2026-10-06T09:30:00.000Z' },
      },
    });
    await panel().findByRole('table', { name: text.list });
    fireEvent.click(panel().getByRole('button', { name: text.edit('Fara Boss') }));
    const ways = within(panel().getByRole('region', { name: text.secrets.title('Fara Boss') }));

    expect(ways.queryByLabelText(text.secrets.password)).not.toBeInTheDocument();
    fireEvent.click(ways.getByRole('button', { name: text.secrets.issueCode }));
    expect(await ways.findByText('K7P2M9QX4R8T')).toBeInTheDocument();
    expect(ways.getByText(text.secrets.codeUntil('06/10/2026', '12:30'))).toBeInTheDocument();
  });
});
