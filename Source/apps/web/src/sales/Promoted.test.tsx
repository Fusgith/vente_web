import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { RIZ, SAVON, searchResult } from './test-hits.js';

const PITCH = 'Nouvelle récolte';
const PROPOSED = { ...RIZ, promotion: { pitch: PITCH } };

function mount() {
  fakeApi({
    'GET /categories': ok({ items: [] }),
    'GET /products/favorites': ok({ items: [SAVON], promoted: [PROPOSED] }),
    'GET /products/search?q=riz': ok(searchResult([PROPOSED])),
  });
  render(
    <StatusLineProvider>
      <Frame workspace="sales" name={labels.workspaces.sales.title}>
        <SalesWorkspace />
      </Frame>
    </StatusLineProvider>,
  );
}

describe('quote screen: the owner’s products to propose (T-037, RG-DEV-06 §6)', () => {
  it('shows them above the best sellers, with their argument', async () => {
    mount();
    const proposed = await screen.findByRole('heading', { name: labels.sales.promoted });
    const favorites = screen.getByRole('heading', { name: labels.sales.favorites });
    expect(proposed.compareDocumentPosition(favorites) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole('button', { name: /^Riz blanc/ })).toHaveTextContent(PITCH);
    expect(screen.getByRole('button', { name: /^Savon de Marseille/ })).not.toHaveTextContent(
      PITCH,
    );
  });

  it('marks them in the search results', async () => {
    mount();
    await screen.findByRole('heading', { name: labels.sales.promoted });
    fireEvent.change(screen.getByRole('searchbox', { name: labels.sales.search }), {
      target: { value: 'riz' },
    });

    await waitFor(() => expect(screen.queryByText(labels.sales.favorites)).toBeNull());
    const mark = await screen.findByText(labels.sales.promoted);
    expect(mark.closest('li')).toHaveTextContent(PITCH);
  });
});
