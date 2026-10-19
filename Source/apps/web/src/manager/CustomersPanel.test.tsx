import { ERROR_LABELS, type Customer } from '@vente-web/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { CustomersPanel } from './CustomersPanel.js';

const text = labels.customers;
const RASOA: Customer = {
  id: '0192a4f0-0000-7000-8000-000000000101',
  name: 'Rasoa Hanta',
  phone: '0341122233',
  secondPhone: null,
  category: 'Divers',
  type: 'INDIVIDUAL',
  isActive: true,
  mergedIntoId: null,
};
const OLD: Customer = {
  ...RASOA,
  id: '0192a4f0-0000-7000-8000-000000000102',
  name: 'Rasoa Miora',
  phone: '0344455566',
  category: 'Ancien',
};

describe('the customers panel (T-029b, H49 a)', () => {
  it('lists a category, narrowed by a name, and classes a customer', async () => {
    const api = fakeApi({
      'GET /customers/categories': ok({ categories: ['Divers', 'Régulier'] }),
      'GET /customers?q=rasoa&category=Divers': ok({ items: [RASOA, OLD], more: true }),
      [`POST /customers/${RASOA.id}/category`]: ok({ ...RASOA, category: 'Régulier' }),
      [`POST /customers/${OLD.id}/category`]: apiError(400, 'CUSTOMER_CATEGORY_UNKNOWN'),
    });
    render(<CustomersPanel />);
    const panel = screen.getByRole('region', { name: text.title });
    const show = within(panel).getByRole('button', { name: text.show });
    expect(show).toBeDisabled();

    fireEvent.change(within(panel).getByLabelText(text.search), { target: { value: ' rasoa ' } });
    fireEvent.change(await within(panel).findByRole('combobox', { name: text.category }), {
      target: { value: 'Divers' },
    });
    fireEvent.click(show);

    const rasoa = await within(panel).findByLabelText(text.categoryOf('Rasoa Hanta'));
    expect(within(panel).getByText('034 11 222 33')).toBeVisible();
    expect(within(panel).getByText(text.refine)).toBeVisible();
    // A category taken off the list still shows on the customer who carries it.
    expect(within(panel).getByLabelText(text.categoryOf('Rasoa Miora'))).toHaveValue('Ancien');

    fireEvent.change(rasoa, { target: { value: 'Régulier' } });
    expect(await within(panel).findByDisplayValue('Régulier')).toBe(rasoa);
    expect(api.callsTo(`POST /customers/${RASOA.id}/category`)[0]?.body).toEqual({
      category: 'Régulier',
    });

    fireEvent.change(within(panel).getByLabelText(text.categoryOf('Rasoa Miora')), {
      target: { value: 'Divers' },
    });
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      ERROR_LABELS.CUSTOMER_CATEGORY_UNKNOWN,
    );
  });

  it('says when no customer matches', async () => {
    fakeApi({
      'GET /customers/categories': ok({ categories: ['Divers'] }),
      'GET /customers?q=zz': ok({ items: [], more: false }),
    });
    render(<CustomersPanel />);
    fireEvent.change(screen.getByLabelText(text.search), { target: { value: 'zz' } });
    fireEvent.click(screen.getByRole('button', { name: text.show }));
    expect(await screen.findByText(text.none)).toBeVisible();
  });
});
