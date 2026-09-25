import { formatMga } from '@vente-web/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { fakeApi, ok } from '../test/fake-api.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { RIZ, SAVON, searchResult } from './test-hits.js';

const [PIECE, PAQUET] = SAVON.units;
const ALIMENTATION = RIZ.category!;
/** Testing Library compares text with its spaces collapsed, non-breaking ones included. */
const shown = (text: string) => text.replace(/\s/g, ' ');
const mga = (amount: string) => shown(formatMga(amount));

const SAV_EXACT = searchResult([SAVON], { productId: SAVON.id, unitId: PIECE!.id });

function mount(handlers: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi({
    'GET /categories': ok({ items: [ALIMENTATION, SAVON.category] }),
    'GET /products/favorites': ok({ items: [SAVON, RIZ] }),
    ...handlers,
  });
  render(<SalesWorkspace />);
  return api;
}

const searchBox = () => screen.getByRole('searchbox', { name: labels.sales.search });

function enter(text: string) {
  fireEvent.change(searchBox(), { target: { value: text } });
  fireEvent.submit(searchBox().closest('form')!);
}

const lineQty = (position: number, qty: string) =>
  screen.findByRole('button', { name: labels.sales.draft.editQty(position, qty) });

const pad = (position = 1) =>
  screen.getByRole('region', { name: labels.sales.pad.title(position) });

describe('quote screen: quick search (RG-DEV-06)', () => {
  it('shows the best sellers and adds one in a single tap', async () => {
    mount();
    expect(screen.getByText(labels.sales.draft.empty)).toBeVisible();

    fireEvent.click(await screen.findByRole('button', { name: /^Savon de Marseille/ }));

    expect(await lineQty(1, '1')).toBeVisible();
    const table = screen.getByRole('table');
    expect(within(table).getByText('SAV-001')).toBeVisible();
    expect(within(table).getAllByText(mga('1500'))).toHaveLength(3);
    expect(screen.getByText(labels.sales.added('1', 'pièce', SAVON.name))).toBeVisible();
    expect(pad()).toBeVisible();
  });

  it('filters the best sellers by category', async () => {
    const api = mount({
      [`GET /products/favorites?categoryId=${ALIMENTATION.id}`]: ok({ items: [RIZ] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: ALIMENTATION.name }));

    expect(await screen.findByRole('button', { name: /^Riz blanc/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Savon de Marseille/ })).toBeNull();
    expect(screen.getByRole('button', { name: ALIMENTATION.name })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(api.callsTo(`GET /products/favorites?categoryId=${ALIMENTATION.id}`)).toHaveLength(1);
  });

  it('lists matches while typing, each sale unit with its price', async () => {
    mount({ 'GET /products/search?q=sav': ok(searchResult([SAVON])) });
    await screen.findByRole('button', { name: /^Savon de Marseille/ });
    fireEvent.change(searchBox(), { target: { value: 'sav' } });

    const paquet = await screen.findByRole('button', { name: /^paquet \(× 6 pièce\)/ });
    expect(paquet).toHaveTextContent(mga('8500'));
    expect(paquet).toHaveTextContent(labels.sales.unitStock('70'));
    expect(paquet).toHaveTextContent(shown(labels.sales.maxDiscount('5')));
    expect(screen.getByRole('button', { name: /^carton/ })).toBeDisabled();
    expect(screen.queryByText(labels.sales.favorites)).toBeNull();
  });

  it('adds the quantity typed before the code in the unit tapped', async () => {
    mount({ 'GET /products/search?q=sav': ok(searchResult([SAVON])) });
    fireEvent.change(searchBox(), { target: { value: '3*sav' } });
    expect(screen.getByText(labels.sales.pendingQty('3'))).toBeVisible();

    fireEvent.click(await screen.findByRole('button', { name: /^paquet/ }));

    expect(await lineQty(1, '3')).toBeVisible();
    expect(screen.getByText('paquet (× 6 pièce)')).toBeVisible();
    expect(searchBox()).toHaveValue('');
  });

  it('asks to refine when more articles match', async () => {
    mount({ 'GET /products/search?q=sa': ok(searchResult([SAVON, RIZ], null, true)) });
    fireEvent.change(searchBox(), { target: { value: 'sa' } });
    expect(await screen.findByText(labels.sales.refine)).toBeVisible();
  });

  it('adds an exact code on Enter, and counts it again on a second Enter', async () => {
    mount({ 'GET /products/search?q=SAV-001': ok(SAV_EXACT) });
    enter('SAV-001');
    expect(await lineQty(1, '1')).toBeVisible();
    expect(searchBox()).toHaveValue('');

    enter('SAV-001');
    expect(await lineQty(1, '2')).toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('adds « 12*CODE » at once', async () => {
    const api = mount({ 'GET /products/search?q=SAV-001': ok(SAV_EXACT) });
    enter('12*SAV-001');
    expect(await lineQty(1, '12')).toBeVisible();
    expect(screen.getByText(mga('18000'), { selector: 'tfoot td' })).toBeVisible();
    expect(api.callsTo('GET /products/search?q=12*SAV-001')).toHaveLength(0);
  });

  it('says so when a code matches nothing', async () => {
    mount({ 'GET /products/search?q=XYZ-999': ok(searchResult([])) });
    enter('XYZ-999');
    expect(await screen.findByText(labels.sales.unknownCode('XYZ-999'))).toBeVisible();
    expect(screen.getByText(labels.sales.draft.empty)).toBeVisible();
  });

  it('leaves the list on screen when words match several articles', async () => {
    mount({ 'GET /products/search?q=savon': ok(searchResult([SAVON])) });
    enter('savon');
    expect(await screen.findByRole('button', { name: /^paquet/ })).toBeVisible();
    expect(screen.getByText(labels.sales.draft.empty)).toBeVisible();
    expect(searchBox()).toHaveValue('savon');
  });

  it('explains when the camera cannot scan here', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: labels.sales.scan }));
    const dialog = screen.getByRole('dialog', { name: labels.sales.scanTitle });
    expect(within(dialog).getByText(labels.sales.scanUnsupported)).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: labels.sales.closeScan }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('quote screen: quantity pad', () => {
  async function addSavon() {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Savon de Marseille/ }));
    return pad();
  }

  it('replaces the quantity with the keys typed', async () => {
    const keys = await addSavon();
    for (const key of ['1', '2', ',', '5']) {
      fireEvent.click(within(keys).getByRole('button', { name: key }));
    }
    fireEvent.click(within(keys).getByRole('button', { name: labels.sales.pad.confirm }));

    expect(await lineQty(1, '12,5')).toBeVisible();
    expect(screen.getByText(mga('18750'), { selector: 'tfoot td' })).toBeVisible();
    expect(screen.queryByRole('region', { name: labels.sales.pad.title(1) })).toBeNull();
  });

  it('refuses a zero quantity', async () => {
    const keys = await addSavon();
    fireEvent.click(within(keys).getByRole('button', { name: '0' }));
    fireEvent.click(within(keys).getByRole('button', { name: labels.sales.pad.confirm }));

    expect(within(keys).getByRole('alert')).toHaveTextContent(labels.sales.pad.invalid);
    expect(await lineQty(1, '1')).toBeVisible();
  });

  it('switches the sale unit with a button', async () => {
    const keys = await addSavon();
    const units = within(keys).getByRole('group', { name: labels.sales.pad.unit });
    fireEvent.click(within(units).getByRole('button', { name: /^paquet/ }));

    // The line now holds another unit: the pad opens again on it.
    const switched = within(pad()).getByRole('group', { name: labels.sales.pad.unit });
    expect(
      within(switched).getByRole('button', { name: new RegExp(`^${PAQUET!.label}`) }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(switched).queryByRole('button', { name: /^carton/ })).toBeNull();
    expect(screen.getByText('paquet (× 6 pièce)')).toBeVisible();
  });

  it('removes the line', async () => {
    const keys = await addSavon();
    fireEvent.click(within(keys).getByRole('button', { name: labels.sales.pad.remove }));
    expect(screen.getByText(labels.sales.draft.empty)).toBeVisible();
  });

  it('opens again on the quantity of a line tapped', async () => {
    const keys = await addSavon();
    fireEvent.click(within(keys).getByRole('button', { name: labels.sales.pad.close }));
    expect(screen.queryByRole('region', { name: labels.sales.pad.title(1) })).toBeNull();

    fireEvent.click(await lineQty(1, '1'));
    expect(pad()).toBeVisible();
  });
});
