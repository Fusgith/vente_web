import { expect, test, type Browser, type Page } from '@playwright/test';

import { DEMO_PASSWORDS } from '../apps/api/prisma/seed/data.js';
import { deliveryLabels } from '../apps/web/src/labels-delivery.js';
import { registerLabels } from '../apps/web/src/labels-register.js';

// The main sale, from the tablet to the counter (CDC technique §11, T-083): quote → order →
// call at the register → split payment → invoice PDF → hand-over → stock out (RG-STK-04).
// Each role works on its own device: one browser context each, on the demo seed.

// labels.ts reads Vite's import.meta.env, absent under Node: its few strings used here are copied.
const labels = {
  login: { username: 'Identifiant', password: 'Mot de passe', signIn: 'Se connecter' },
  shell: { signOut: 'Se déconnecter' },
  sales: {
    search: 'Rechercher un article',
    customer: {
      choose: 'Choisir le client',
      title: 'Client du devis',
      search: 'Téléphone ou nom du client',
    },
    draft: { submit: 'Valider la commande' },
    order: { title: 'Commande validée' },
  },
  register: registerLabels,
  delivery: deliveryLabels,
};

const CUSTOMER = 'Rasoanaivo Hanta';
const SOAP = 'SAV-001'; // 432 pièces in the seed; a paquet is 6 pièces at 25 000 MGA (RG-ART-06)

async function signIn(browser: Browser, username: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel(labels.login.username).fill(username);
  await page.getByLabel(labels.login.password, { exact: true }).fill(DEMO_PASSWORDS.shop);
  await page.getByRole('button', { name: labels.login.signIn }).click();
  await expect(page.getByRole('button', { name: labels.shell.signOut })).toBeVisible();
  return page;
}

const band = (page: Page) => page.getByRole('contentinfo').getByRole('status');

async function soapStock(page: Page) {
  const search = await page.request.get(`/api/v1/products/search?q=${SOAP}`);
  const { exact } = (await search.json()) as { exact: { productId: string } };
  const stock = await page.request.get(`/api/v1/products/${exact.productId}/stock`);
  return (await stock.json()) as { onHand: string; reserved: string };
}

test('a sale from the quote to the stock out', async ({ browser }) => {
  const manager = await signIn(browser, 'responsable');
  const before = await soapStock(manager);

  // The salesperson: customer, 2 paquets, the order validated; the ticket goes to the customer.
  const sales = await signIn(browser, 'vola');
  await sales.getByRole('button', { name: labels.sales.customer.choose }).click();
  const customers = sales.getByRole('dialog', { name: labels.sales.customer.title });
  await customers.getByLabel(labels.sales.customer.search).fill('Rasoanaivo');
  await customers.getByRole('button', { name: CUSTOMER }).click();
  await sales.getByRole('searchbox', { name: labels.sales.search }).fill(`2*${SOAP}`);
  await sales.getByRole('button', { name: /^paquet/ }).click();
  await expect(sales.getByRole('table')).toContainText(SOAP);
  await sales.getByRole('button', { name: labels.sales.draft.submit }).click();
  await expect(sales.getByRole('dialog', { name: labels.sales.order.title })).toBeVisible();
  const validated = await band(sales).textContent();
  const ticket = /ticket (\S+) —/.exec(validated ?? '')?.[1];
  expect(ticket, `bande : ${validated}`).toBeTruthy();
  const reserved = await soapStock(manager);
  expect(Number(reserved.reserved) - Number(before.reserved)).toBe(12); // RG-STK-02
  expect(reserved.onHand).toBe(before.onHand);

  // The cashier: register opened, the customer called, paid in cash and Mvola.
  const register = await signIn(browser, 'caisse1');
  const opening = register.getByRole('region', { name: labels.register.openTitle });
  await opening.getByRole('button', { name: 'Caisse 1' }).click();
  await opening.getByLabel(labels.register.openingFloat).fill('50 000');
  await opening.getByRole('button', { name: labels.register.openRegister }).click();
  await register.getByRole('button', { name: labels.register.call(ticket!) }).click();
  await register.getByRole('button', { name: labels.register.pay, exact: true }).click();
  const payment = register.getByRole('dialog', {
    name: labels.register.payTitle(ticket!, CUSTOMER),
  });
  await payment.getByLabel(labels.register.lineAmount, { exact: true }).first().fill('20 000');
  await payment.getByRole('button', { name: labels.register.addMethod }).click();
  await payment.getByLabel(labels.register.reference).fill('MP-E2E-0001');
  await payment.getByRole('button', { name: /^Encaisser .*MGA$/ }).click();
  const invoice = register.getByRole('link', { name: labels.register.openInvoice });
  const pdf = await register.request.get((await invoice.getAttribute('href'))!);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  // The warehouse: the paid order taken, prepared, every line handed over.
  const counter = await signIn(browser, 'magasin1');
  await counter.getByRole('button', { name: labels.delivery.take(ticket!) }).click();
  await counter.getByRole('button', { name: labels.delivery.ready }).click();
  await counter.getByRole('checkbox', { name: labels.delivery.handed(1) }).check();
  await counter.getByRole('button', { name: labels.delivery.deliver }).click();
  await expect(band(counter)).toContainText(labels.delivery.delivered(ticket!, CUSTOMER));

  // RG-STK-04: the stock leaves at the hand-over, in pièces (2 paquets × 6).
  const after = await soapStock(manager);
  expect(Number(before.onHand) - Number(after.onHand)).toBe(12);
  expect(after.reserved).toBe(before.reserved);
});
