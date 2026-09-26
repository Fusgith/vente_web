import { formatMga } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { draftReducer, emptyDraft, type DraftState } from './draft.js';
import { SalesWorkspace } from './SalesWorkspace.js';
import { CUSTOMER, QUOTE_ID, RIZ, SAVON, savedQuote, searchResult } from './test-hits.js';

const [PIECE, PAQUET] = SAVON.units;
const ALIMENTATION = RIZ.category!;
/** Testing Library compares text with its spaces collapsed, non-breaking ones included. */
const shown = (text: string) => text.replace(/\s/g, ' ');
const mga = (amount: string) => shown(formatMga(amount));

const SAV_EXACT = searchResult([SAVON], { productId: SAVON.id, unitId: PIECE!.id });

function mount(
  handlers: Parameters<typeof fakeApi>[0] = {},
  initialDraft: DraftState = emptyDraft,
) {
  const api = fakeApi({
    'GET /categories': ok({ items: [ALIMENTATION, SAVON.category] }),
    'GET /products/favorites': ok({ items: [SAVON, RIZ] }),
    ...handlers,
  });
  // The workspace speaks through the frame's bottom band, as in the app.
  render(
    <StatusLineProvider>
      <Frame workspace="sales" name={labels.workspaces.sales.title}>
        <SalesWorkspace initialDraft={initialDraft} />
      </Frame>
    </StatusLineProvider>,
  );
  return api;
}

/** The amount due, under the table (RG-DEV-05). */
const amountDue = () => screen.getByText(labels.sales.draft.total).nextElementSibling;
const searchBox = () => screen.getByRole('searchbox', { name: labels.sales.search });
/** The frame's bottom band: the one sentence of what just happened. */
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');
/** The band's assertive region: errors interrupt. */
const bandAlert = () => within(screen.getByRole('contentinfo')).getByRole('alert');
const categoryTrigger = () => screen.findByRole('button', { name: /^Catégorie/ });

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
    expect(within(table).getAllByText(mga('1500'))).toHaveLength(2);
    expect(amountDue()).toHaveTextContent(mga('1500'));
    expect(band()).toHaveTextContent(shown(labels.sales.added('1', 'pièce', SAVON.name)));
    expect(pad()).toBeVisible();
  });

  it('filters the best sellers by category', async () => {
    const api = mount({
      [`GET /products/favorites?categoryId=${ALIMENTATION.id}`]: ok({ items: [RIZ] }),
    });
    fireEvent.click(await categoryTrigger());
    const sheet = screen.getByRole('dialog', { name: labels.sales.categories });
    const all = within(sheet).getByRole('button', { name: labels.sales.allCategoriesTile });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(sheet).getByRole('button', { name: ALIMENTATION.name }));

    // Choosing closes the sheet; the trigger names the category.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await categoryTrigger()).toHaveTextContent(ALIMENTATION.name);
    expect(await screen.findByRole('button', { name: /^Riz blanc/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Savon de Marseille/ })).toBeNull();
    expect(api.callsTo(`GET /products/favorites?categoryId=${ALIMENTATION.id}`)).toHaveLength(1);

    fireEvent.click(await categoryTrigger());
    const again = screen.getByRole('dialog', { name: labels.sales.categories });
    const chosen = within(again).getByRole('button', { name: ALIMENTATION.name });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(again).getByRole('button', { name: labels.sales.closeCategories }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists matches while typing: stock and cap once, each sale unit with its price', async () => {
    mount({ 'GET /products/search?q=sav': ok(searchResult([SAVON])) });
    await screen.findByRole('button', { name: /^Savon de Marseille/ });
    fireEvent.change(searchBox(), { target: { value: 'sav' } });

    const paquet = await screen.findByRole('button', { name: /^paquet \(× 6 pièce\)/ });
    expect(paquet).toHaveTextContent(mga('8500'));
    expect(paquet).not.toHaveTextContent(labels.sales.unitStock('70'));
    const row = paquet.closest('li')!;
    expect(row).toHaveTextContent(shown(labels.sales.availableIn('420', 'pièce')));
    expect(row).toHaveTextContent(shown(labels.sales.maxDiscount('5')));
    expect(screen.getByRole('button', { name: /^carton/ })).toBeDisabled();
    expect(screen.queryByText(labels.sales.favorites)).toBeNull();
  });

  it('adds the quantity typed before the code in the unit tapped', async () => {
    mount({ 'GET /products/search?q=sav': ok(searchResult([SAVON])) });
    fireEvent.change(searchBox(), { target: { value: '3*sav' } });
    expect(screen.getByText(labels.sales.pendingQty('3'))).toBeVisible();

    fireEvent.click(await screen.findByRole('button', { name: /^paquet/ }));

    expect(await lineQty(1, '3')).toBeVisible();
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('paquet (× 6 pièce)');
    expect(searchBox()).toHaveValue('');
  });

  it('empties the field with its clear button, and hides the hint while typing', async () => {
    mount({ 'GET /products/search?q=sav': ok(searchResult([SAVON])) });
    expect(screen.getByText(labels.sales.searchHint)).toBeVisible();
    fireEvent.change(searchBox(), { target: { value: 'sav' } });
    expect(screen.queryByText(labels.sales.searchHint)).toBeNull();
    await screen.findByRole('button', { name: /^paquet/ });

    fireEvent.click(screen.getByRole('button', { name: labels.sales.clearSearch }));
    expect(searchBox()).toHaveValue('');
    expect(searchBox()).toHaveFocus();
    expect(await screen.findByText(labels.sales.favorites)).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.sales.clearSearch })).toBeNull();
  });

  it('says in the band when nothing matches the words typed', async () => {
    mount({ 'GET /products/search?q=zzz': ok(searchResult([])) });
    fireEvent.change(searchBox(), { target: { value: 'zzz' } });
    await waitFor(() => expect(band()).toHaveTextContent(labels.sales.noResult));
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
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('adds « 12*CODE » at once', async () => {
    const api = mount({ 'GET /products/search?q=SAV-001': ok(SAV_EXACT) });
    enter('12*SAV-001');
    expect(await lineQty(1, '12')).toBeVisible();
    expect(amountDue()).toHaveTextContent(mga('18000'));
    expect(api.callsTo('GET /products/search?q=12*SAV-001')).toHaveLength(0);
  });

  it('says so when a code matches nothing', async () => {
    mount({ 'GET /products/search?q=XYZ-999': ok(searchResult([])) });
    enter('XYZ-999');
    await waitFor(() =>
      expect(bandAlert()).toHaveTextContent(shown(labels.sales.unknownCode('XYZ-999'))),
    );
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
    expect(amountDue()).toHaveTextContent(mga('18750'));
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
    // Its stock in that unit (420 pieces are 70 packets) is told on its button.
    const chosen = within(switched).getByRole('button', { name: /^paquet/ });
    expect(chosen).toHaveTextContent(labels.sales.unitStock('70'));
    // The cap is told with the discount: 5 % of one packet.
    expect(pad()).toHaveTextContent(shown(labels.sales.discount.maxLine('5', formatMga('425'))));
    expect(within(switched).queryByRole('button', { name: /^carton/ })).toBeNull();
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('paquet (× 6 pièce)');
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
    expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-current', 'true');
  });

  it('leaves Space to the focused key, and a scanned character to the search field', async () => {
    const keys = await addSavon();
    const five = within(keys).getByRole('button', { name: '5' });
    five.focus();

    // Space presses the key (the browser clicks it): it is not typed into the search.
    fireEvent.keyDown(five, { key: ' ' });
    expect(five).toHaveFocus();
    expect(searchBox()).toHaveValue('');
    expect(pad()).toBeVisible();

    // A scanner's first character still goes to the search field.
    fireEvent.keyDown(five, { key: 'S' });
    expect(searchBox()).toHaveFocus();
  });

  it('gives its place back to the results when typing', async () => {
    const keys = await addSavon();
    expect(keys).toBeVisible();
    fireEvent.change(searchBox(), { target: { value: 'sav' } });
    expect(screen.queryByRole('region', { name: labels.sales.pad.title(1) })).toBeNull();
    expect(screen.getAllByRole('row')[1]).not.toHaveAttribute('aria-current');
  });
});

describe('quote screen: discounts (RG-REM-02, RG-REM-06)', () => {
  const discount = labels.sales.discount;
  const press = (area: HTMLElement, ...keys: string[]) => {
    for (const key of keys) fireEvent.click(within(area).getByRole('button', { name: key }));
  };
  const confirm = (area: HTMLElement) =>
    fireEvent.click(within(area).getByRole('button', { name: labels.sales.pad.confirm }));
  const discountField = (area: HTMLElement) =>
    within(area).getByRole('button', { name: new RegExp(`^${discount.label}`) });

  async function addSavon() {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Savon de Marseille/ }));
    return pad();
  }

  it('takes a line discount in %, its maximum told before typing', async () => {
    const keys = await addSavon();
    press(keys, '3');
    fireEvent.click(discountField(keys));
    // 3 × 1 500 under a 5 % cap: at most 225 MGA.
    expect(keys).toHaveTextContent(shown(discount.maxLine('5', formatMga('225'))));
    press(keys, '5');
    expect(discountField(keys)).toHaveTextContent(`5 ${discount.pctSign}`);
    confirm(keys);

    const row = screen.getAllByRole('row')[1]!;
    expect(row).toHaveTextContent(shown(labels.sales.draft.minus(formatMga('225'))));
    expect(row).toHaveTextContent(shown(labels.sales.draft.pct('5')));
    expect(amountDue()).toHaveTextContent(mga('4275'));
  });

  it('refuses a key that would go beyond the cap of the line', async () => {
    const keys = await addSavon();
    fireEvent.click(discountField(keys));
    press(keys, '6');

    expect(within(keys).getByRole('alert')).toHaveTextContent(
      shown(discount.beyondLine('5', formatMga('75'))),
    );
    expect(discountField(keys)).toHaveTextContent(`0 ${discount.pctSign}`);
    press(keys, '4');
    expect(within(keys).queryByRole('alert')).toBeNull();
    expect(discountField(keys)).toHaveTextContent(`4 ${discount.pctSign}`);
  });

  it('takes an amount, and checks it again against a smaller quantity', async () => {
    const keys = await addSavon();
    press(keys, '3');
    fireEvent.click(discountField(keys));
    fireEvent.click(within(keys).getByRole('button', { name: discount.inAmount }));
    press(keys, '2', '2', '5');
    confirm(keys);
    expect(amountDue()).toHaveTextContent(mga('4275'));

    // Down to 2 items, the cap is 150 MGA: the 225 MGA agreed no longer fit.
    fireEvent.click(await lineQty(1, '3'));
    const again = pad();
    press(again, '2');
    confirm(again);
    expect(within(again).getByRole('alert')).toHaveTextContent(
      shown(discount.beyondLine('5', formatMga('150'))),
    );
    expect(await lineQty(1, '3')).toBeVisible();
  });

  it('offers no discount on a line without a cap', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Riz blanc/ }));
    const keys = pad();

    expect(discountField(keys)).toBeDisabled();
    expect(within(keys).getByRole('button', { name: discount.inAmount })).toBeDisabled();
    expect(keys).toHaveTextContent(discount.noLineDiscount);
  });

  it('drops the discount of a line whose unit changes', async () => {
    const keys = await addSavon();
    fireEvent.click(discountField(keys));
    press(keys, '5');
    confirm(keys);
    expect(amountDue()).toHaveTextContent(mga('1425'));

    fireEvent.click(await lineQty(1, '1'));
    const units = within(pad()).getByRole('group', { name: labels.sales.pad.unit });
    fireEvent.click(within(units).getByRole('button', { name: /^paquet/ }));
    expect(amountDue()).toHaveTextContent(mga('8500'));
    expect(screen.queryByText(labels.sales.draft.discountTotal)).toBeNull();
  });

  it('takes a discount on the total within what the line caps leave', async () => {
    const keys = await addSavon();
    fireEvent.click(within(keys).getByRole('button', { name: labels.sales.pad.close }));
    fireEvent.click(screen.getByRole('button', { name: discount.order }));
    const sheet = screen.getByRole('dialog', { name: discount.order });
    // One piece at 1 500 under a 5 % cap: 75 MGA of room.
    expect(sheet).toHaveTextContent(shown(discount.maxOrder(formatMga('75'))));

    fireEvent.click(within(sheet).getByRole('button', { name: discount.inAmount }));
    press(sheet, '8', '0');
    expect(within(sheet).getByRole('alert')).toHaveTextContent(
      shown(discount.beyondOrder(formatMga('75'))),
    );
    press(sheet, labels.sales.pad.erase, '7', '5');
    expect(within(sheet).queryByRole('alert')).toBeNull();
    expect(sheet).toHaveTextContent(mga('1425'));
    fireEvent.click(within(sheet).getByRole('button', { name: discount.apply }));

    expect(screen.queryByRole('dialog')).toBeNull();
    const row = screen.getByText(labels.sales.draft.orderDiscount, { selector: 'dt' });
    expect(row.nextElementSibling).toHaveTextContent(
      shown(labels.sales.draft.minus(formatMga('75'))),
    );
    expect(amountDue()).toHaveTextContent(mga('1425'));
  });
});

describe('quote screen: saving (T-030)', () => {
  const text = labels.sales.draft;
  /** Two packs of soap, the pad closed. */
  const twoPacks = draftReducer(
    draftReducer(emptyDraft, { type: 'add', hit: SAVON, unitId: PAQUET!.id, qty: '2' }),
    { type: 'select', key: null },
  );
  const ready = draftReducer(twoPacks, { type: 'setCustomer', customer: CUSTOMER });
  const saveButton = (name: string) => screen.getByRole('button', { name });
  /** Once saved and unchanged, the save gives way to the PDF of the quote as saved. */
  const pdfLink = () => screen.getByRole('link', { name: text.openPdf });

  it('asks for the customer before saving', () => {
    const api = mount({}, twoPacks);
    fireEvent.click(saveButton(text.save));
    expect(bandAlert()).toHaveTextContent(text.customerFirst);
    expect(api.callsTo('POST /quotes')).toHaveLength(0);
  });

  it('saves the quote, then its changes over the version read', async () => {
    const number = 'D-2026-000001';
    const api = mount({ 'POST /quotes': ok(savedQuote(ready, number)) }, ready);
    fireEvent.click(saveButton(text.save));

    await waitFor(() => expect(band()).toHaveTextContent(text.saved(number)));
    expect(api.callsTo('POST /quotes')[0]!.body).toEqual({
      customerId: CUSTOMER.id,
      lines: [{ productUnitId: PAQUET!.id, qty: '2', discount: null }],
      orderDiscount: null,
    });
    expect(screen.getByText(text.savedAs(number))).toBeVisible();
    expect(pdfLink()).toHaveAttribute('href', `/api/v1/quotes/${QUOTE_ID}/pdf`);
    expect(pdfLink()).toHaveAttribute('target', '_blank');

    fireEvent.click(await lineQty(1, '2'));
    fireEvent.click(within(pad()).getByRole('button', { name: '3' }));
    fireEvent.click(within(pad()).getByRole('button', { name: labels.sales.pad.confirm }));
    expect(screen.getByText(`${text.savedAs(number)}, ${text.changed}`)).toBeVisible();
    expect(screen.queryByRole('link', { name: text.openPdf })).toBeNull();

    api.on(`PUT /quotes/${QUOTE_ID}`, ok(savedQuote(ready, number, 2)));
    fireEvent.click(saveButton(text.saveChanges));
    await waitFor(() => expect(pdfLink()).toBeVisible());
    expect(api.callsTo(`PUT /quotes/${QUOTE_ID}`)[0]!.body).toMatchObject({
      lines: [{ qty: '3' }],
      version: 1,
    });
  });

  it('tells which lines the API refused', async () => {
    mount({ 'POST /quotes': apiError(422, 'QUOTE_LINE_UNAVAILABLE', { lines: [1] }) }, ready);
    fireEvent.click(saveButton(text.save));
    await waitFor(() => expect(bandAlert()).toHaveTextContent(text.linesConcerned('1')));
    expect(screen.getByText(text.unsaved)).toBeVisible();
    expect(saveButton(text.save)).toBeEnabled();
  });
});
