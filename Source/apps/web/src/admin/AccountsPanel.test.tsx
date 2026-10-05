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

const account = (over: Partial<UserAccount>): UserAccount => ({
  id: RIJA_ID,
  username: 'rija',
  fullName: 'Rija Rakoto',
  roles: ['sales'],
  ticketLetter: 'A',
  isActive: true,
  hasPin: true,
  hasPassword: false,
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
  hasPin: false,
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
    expect(rowOf('rija').getByText(text.access.pin)).toBeInTheDocument();
    expect(rowOf('admin').getByText(text.state.locked)).toBeInTheDocument();
    expect(rowOf('admin').getByText(text.access.passwordToChange)).toBeInTheDocument();
  });

  it('creates a sales account: the ticket letter is asked for a sales clerk only', async () => {
    const LOVA = account({
      id: LOVA_ID,
      username: 'lova',
      fullName: 'Lova Ranaivo',
      ticketLetter: 'B',
      hasPin: false,
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
