import { formatPhone, type Customer, type DiscountCode } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { RealtimeProvider } from '../realtime/RealtimeProvider.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, meFor, ok, RIJA } from '../test/fake-api.js';
import { fakeRealtime } from '../test/fake-socket.js';
import { DiscountCodesPanel } from './DiscountCodesPanel.js';

const text = labels.codes;

const CODE = '0192a4f0-0000-7000-8000-000000000501';
const SOAP = '0192a4f0-0000-7000-8000-000000000311';
const RASOA: Customer = {
  id: '0192a4f0-0000-7000-8000-000000000401',
  name: 'Rasoa Hanta',
  phone: '0341122233',
  secondPhone: null,
  category: 'Divers',
  isActive: true,
  mergedIntoId: null,
};
const LIST = 'GET /discount-codes';
const ISSUE = 'POST /discount-codes';
const REVOKE = `POST /discount-codes/${CODE}/revoke`;

const code = (status: DiscountCode['status']): DiscountCode => ({
  id: CODE,
  code: 'K7QM-3XWP',
  status,
  customer: { id: RASOA.id, name: RASOA.name, phone: RASOA.phone },
  orderId: null,
  issuedAt: '2026-09-29T07:00:00.000Z',
  expiresAt: '2026-10-29T20:59:00.000Z',
  usedAt: null,
  revokedAt: status === 'REVOKED' ? '2026-09-29T08:00:00.000Z' : null,
  items: [
    {
      product: { id: SOAP, sku: 'SAV-001', name: 'Savon de Marseille 200 g' },
      discount: { kind: 'pct', value: '12.00' },
    },
    { product: null, discount: { kind: 'amount', value: '5000.00' } },
  ],
});
/** Today plus 30 days, as the API proposes it (H63). */
const PROPOSED = '2026-10-29';
const listOf = (items: DiscountCode[]) => ok({ items, defaultValidUntil: PROPOSED });
const soapHit = ok({
  exact: null,
  more: false,
  items: [
    {
      id: SOAP,
      sku: 'SAV-001',
      name: 'Savon de Marseille 200 g',
      category: null,
      baseUnit: 'pièce',
      available: '130.00',
      units: [],
    },
  ],
});

async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <RealtimeProvider me={meFor({ user: { ...RIJA, roles: ['owner'] }, activeRole: 'owner' })}>
      <StatusLineProvider>
        <Frame workspace="owner" name={labels.workspaces.owner.title}>
          <DiscountCodesPanel />
        </Frame>
      </StatusLineProvider>
    </RealtimeProvider>,
  );
  await waitFor(() => expect(fakeRealtime.sockets[0]?.connected).toBe(true));
  return api;
}

const panel = () => within(screen.getByRole('region', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
/** Both searches have their own « Chercher »: each is pressed within its own form. */
function search(name: string, value: string) {
  const box = panel().getByRole('searchbox', { name });
  fireEvent.change(box, { target: { value } });
  const form = box.closest('form');
  if (!form) throw new Error('search outside a form');
  fireEvent.click(within(form).getByRole('button', { name: text.searchGo }));
}

describe('DiscountCodesPanel — the owner’s promo codes (T-034, T-091, RG-REM-04, H63)', () => {
  it('issues a code for a customer, on a product and on the total, and lists it', async () => {
    const api = await mount({
      [LIST]: listOf([]),
      'GET /customers?q=rasoa': ok({ items: [RASOA], more: false }),
      'GET /products/search?q=sav': soapHit,
      [ISSUE]: { status: 201, body: code('ACTIVE') },
    });
    expect(await panel().findByText(text.empty)).toBeInTheDocument();
    const issue = panel().getByRole('button', { name: text.issue });
    expect(issue).toBeDisabled();

    search(text.customerSearch, 'rasoa');
    fireEvent.click(
      await panel().findByRole('button', {
        name: text.pickCustomer(RASOA.name, formatPhone(RASOA.phone)),
      }),
    );
    search(text.productSearch, 'sav');
    fireEvent.click(
      await panel().findByRole('button', { name: text.add('SAV-001', 'Savon de Marseille 200 g') }),
    );
    const soapGrant = panel().getByRole('textbox', { name: text.grantOf('SAV-001') });
    fireEvent.change(soapGrant, { target: { value: '120' } });
    expect(soapGrant).toHaveAttribute('aria-invalid', 'true');
    expect(issue).toBeDisabled();
    fireEvent.change(soapGrant, { target: { value: '12' } });
    fireEvent.click(panel().getByRole('checkbox', { name: text.total }));
    fireEvent.change(panel().getByRole('combobox', { name: text.kindOf(text.totalWhat) }), {
      target: { value: 'amount' },
    });
    fireEvent.change(panel().getByRole('textbox', { name: text.grantOf(text.totalWhat) }), {
      target: { value: '5 000' },
    });
    // Valid 30 days unless the owner chooses another day (H63).
    expect(panel().getByLabelText(text.validUntil)).toHaveValue(PROPOSED);
    fireEvent.change(panel().getByLabelText(text.validUntil), { target: { value: '' } });
    expect(issue).toBeDisabled();
    fireEvent.change(panel().getByLabelText(text.validUntil), {
      target: { value: '2026-11-15' },
    });
    expect(issue).toBeEnabled();
    fireEvent.click(issue);

    await waitFor(() => expect(band().textContent).toBe(text.issued('K7QM-3XWP', RASOA.name)));
    expect(api.callsTo(ISSUE)[0]?.body).toEqual({
      customerId: RASOA.id,
      validUntil: '2026-11-15',
      items: [
        { productId: SOAP, discount: { kind: 'pct', value: '12' } },
        { productId: null, discount: { kind: 'amount', value: '5000' } },
      ],
    });
    expect(panel().getByRole('status', { name: text.toGive })).toHaveTextContent('K7QM-3XWP');
    expect(panel().getByText(text.validTo('29/10/2026'), { exact: false })).toBeInTheDocument();
    const row = within(panel().getByRole('table', { name: text.list })).getAllByRole(
      'row',
    )[1] as HTMLElement;
    expect(row.textContent?.replace(/\s/g, ' ')).toContain('SAV-001 : 12 % ; Total : 5 000,00 MGA');
    expect(within(row).getByText(text.status.ACTIVE)).toBeInTheDocument();
    expect(row).toHaveTextContent('29/10/2026');
    // The form is ready for the next code.
    expect(panel().queryByRole('textbox', { name: text.grantOf('SAV-001') })).toBeNull();
    expect(panel().getByLabelText(text.validUntil)).toHaveValue(PROPOSED);
    expect(issue).toBeDisabled();
  });

  it('revokes an active code, then offers nothing more on it', async () => {
    await mount({ [LIST]: listOf([code('ACTIVE')]), [REVOKE]: ok(code('REVOKED')) });

    fireEvent.click(await panel().findByRole('button', { name: text.revokeOf('K7QM-3XWP') }));

    await waitFor(() => expect(band().textContent).toBe(text.revoked('K7QM-3XWP')));
    expect(panel().getByText(text.status.REVOKED)).toBeInTheDocument();
    expect(panel().queryByRole('button', { name: text.revokeOf('K7QM-3XWP') })).toBeNull();
  });
});
