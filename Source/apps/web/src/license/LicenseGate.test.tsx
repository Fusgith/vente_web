import { ERROR_LABELS, type LicenseStatus } from '@vente-web/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { trialDaysLeft } from './context.js';
import { LicenseGate } from './LicenseGate.js';

const text = labels.license;
const MACHINE = 'ABCD-0123-4567-89EF';
const status = (state: LicenseStatus['state'], expires: string | null = null): LicenseStatus => ({
  state,
  machine: MACHINE,
  client: state === 'valid' ? 'Épicerie Rasoa' : null,
  expires,
});

const mount = () =>
  render(
    <LicenseGate>
      <p>Application ouverte</p>
    </LicenseGate>,
  );

describe('the trial license gate (T-101, ADR-0010)', () => {
  it('shows the server code and opens the application once a key is accepted', async () => {
    const api = fakeApi({
      'GET /license': ok(status('missing')),
      'POST /license': ok(status('valid', '2026-11-30T23:59:59+03:00')),
    });
    mount();

    expect(await screen.findByText(text.reasons.missing)).toBeInTheDocument();
    expect(screen.getByText(MACHINE)).toBeInTheDocument();
    expect(screen.queryByText('Application ouverte')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(text.key), { target: { value: ' abc.\n def ' } });
    fireEvent.click(screen.getByRole('button', { name: text.enter }));

    expect(await screen.findByText('Application ouverte')).toBeInTheDocument();
    expect(api.callsTo('POST /license').map((call) => call.body)).toEqual([{ key: 'abc.def' }]);
  });

  it('says why a key is refused', async () => {
    fakeApi({
      'GET /license': ok(status('expired', '2026-10-01T23:59:59+03:00')),
      'POST /license': apiError(422, 'LICENSE_KEY_OTHER_MACHINE'),
    });
    mount();

    fireEvent.change(await screen.findByLabelText(text.key), { target: { value: 'abc.def' } });
    fireEvent.click(screen.getByRole('button', { name: text.enter }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.LICENSE_KEY_OTHER_MACHINE,
    );
    expect(screen.getByText(text.reasons.expired)).toBeInTheDocument();
  });

  it('lets the application through without a vendor key or when the server is silent', async () => {
    fakeApi({ 'GET /license': ok({ ...status('unchecked'), machine: null }) });
    const { unmount } = mount();
    expect(await screen.findByText('Application ouverte')).toBeInTheDocument();
    unmount();

    fakeApi({ 'GET /license': 'network' });
    mount();
    expect(await screen.findByText('Application ouverte')).toBeInTheDocument();
  });

  it('counts the days left only in the last week of a trial (H82)', () => {
    const now = Date.parse('2026-11-25T10:00:00+03:00');
    expect(trialDaysLeft(status('valid', '2026-11-30T23:59:59+03:00'), now)).toBe(6);
    expect(trialDaysLeft(status('valid', '2026-12-30T23:59:59+03:00'), now)).toBeNull();
    expect(trialDaysLeft(status('valid'), now)).toBeNull();
    expect(trialDaysLeft(status('valid', '2026-11-25T18:00:00+03:00'), now)).toBe(1);
  });
});
