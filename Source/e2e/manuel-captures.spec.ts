import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

import { DEMO_PASSWORDS } from '../apps/api/prisma/seed/data.js';
import { deliveryLabels } from '../apps/web/src/labels-delivery.js';
import { registerLabels } from '../apps/web/src/labels-register.js';

// The user manual's screenshots (Docs/manuel): one pass over every role on the demo seed.
// Run on demand only: MANUEL_CAPTURES=1 DATABASE_URL=… pnpm e2e manuel-captures
test.skip(!process.env.MANUEL_CAPTURES, 'MANUEL_CAPTURES=1 pour régénérer les captures du manuel');
test.use({ actionTimeout: 10_000 });

const OUT = resolve('..', 'Docs', 'manuel', 'captures');
const VIEWPORT = { width: 1280, height: 800 };
const CUSTOMER = 'Rasoanaivo Hanta';

const failures: string[] = [];

async function shot(target: Page | Locator, name: string) {
  const path = join(OUT, `${name}.png`);
  if (!('page' in target)) return void (await target.screenshot({ path, animations: 'disabled' }));
  // The app scrolls inside its own frame: a panel taller than the screen comes out blank
  // below the fold, so the screen grows to hold it, then shrinks back.
  const page = target.page();
  const box = await target.boundingBox();
  const height = Math.ceil(box?.height ?? 0) + 400;
  if (height > VIEWPORT.height) await page.setViewportSize({ width: VIEWPORT.width, height });
  await target.screenshot({ path, animations: 'disabled' });
  await page.setViewportSize(VIEWPORT);
}

/** A section that fails is reported, its page kept for diagnosis, and the others still run. */
async function section(name: string, page: Page, body: () => Promise<void>) {
  try {
    await body();
  } catch (failure) {
    failures.push(`${name}: ${String(failure).split('\n')[0]}`);
    await page.screenshot({ path: join('test-results', `echec-${name}.png`) }).catch(() => {});
  }
}

async function open(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: VIEWPORT })).newPage();
}

async function signIn(browser: Browser, username: string): Promise<Page> {
  const password =
    username === 'boss'
      ? DEMO_PASSWORDS.boss
      : username === 'admin'
        ? DEMO_PASSWORDS.admin
        : DEMO_PASSWORDS.shop;
  const page = await open(browser);
  await page.goto('/');
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  return page;
}

const band = (page: Page) => page.getByRole('contentinfo').getByRole('status');
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

async function addLine(page: Page, entry: string, unit: RegExp) {
  await page.getByRole('searchbox', { name: 'Rechercher un article' }).fill(entry);
  await page.getByRole('button', { name: unit }).first().click();
}

/** A panel by its title: the section (or block) around its heading. */
const panel = (page: Page, title: string) =>
  page
    .getByRole('heading', { name: title, exact: true, level: 2 })
    .locator('xpath=ancestor::*[self::section or self::div][1]');

async function panels(page: Page, list: readonly (readonly [string, string])[]) {
  for (const [title, file] of list) {
    const block = panel(page, title);
    await block.scrollIntoViewIfNeeded();
    await shot(block, file);
  }
}

test('captures du manuel', async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });

  // Login.
  const login = await open(browser);
  await login.goto('/');
  await expect(login.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await shot(login, '01-connexion');
  await login.context().close();

  // The admin first: the public display on, so that the calls show on it.
  const admin = await signIn(browser, 'admin');
  await section('admin', admin, async () => {
    await shot(admin, '60-admin-accueil');
    await shot(region(admin, 'Comptes'), '61-admin-comptes');
    const stations = region(admin, 'Postes du magasin');
    // Saved first, then shown checked: click, and wait for it.
    await stations.getByLabel('Actif : Écran public').click();
    await expect(stations.getByLabel('Actif : Écran public')).toBeChecked();
    await stations.getByLabel('Nom', { exact: true }).fill('Borne entrée');
    await stations.getByLabel('Type').selectOption({ label: 'Borne libre-service' });
    await stations.getByRole('button', { name: 'Ajouter le poste' }).click();
    await expect(stations.getByRole('link', { name: 'Adresse de la borne' })).toBeVisible();
    await shot(stations, '62-admin-postes');
  });
  await section('admin-parametres', admin, async () => {
    const settings = region(admin, 'Paramètres');
    await settings.getByLabel('Écran public allumé').click();
    await expect(settings.getByLabel('Écran public allumé')).toBeChecked();
    await settings.getByRole('button', { name: 'Enregistrer' }).click();
    await admin.waitForTimeout(800);
    await shot(settings, '63-admin-parametres');
    await shot(region(admin, 'Remises du commercial'), '64-admin-remises-commercial');
  });

  // The salesperson: customer, lines, quote, order.
  const sales = await signIn(browser, 'vola');
  let ticket = '';
  await section('commercial', sales, async () => {
    await shot(sales, '10-vente-accueil');
    await sales.getByRole('button', { name: 'Choisir le client' }).click();
    const customers = sales.getByRole('dialog', { name: 'Client du devis' });
    await customers.getByLabel('Téléphone ou nom du client').fill('Rasoa');
    await expect(customers.getByRole('button', { name: CUSTOMER })).toBeVisible();
    await shot(sales, '11-vente-client');
    await customers.getByRole('button', { name: CUSTOMER }).click();

    await sales.getByRole('searchbox', { name: 'Rechercher un article' }).fill('savon');
    await sales.waitForTimeout(800);
    await shot(sales, '12-vente-recherche');
    await sales.getByRole('searchbox', { name: 'Rechercher un article' }).fill('2*SAV-001');
    await expect(sales.getByRole('button', { name: /^paquet/ })).toBeVisible();
    await shot(sales, '13-vente-unites');
    await sales.getByRole('button', { name: /^paquet/ }).click();
    await addLine(sales, 'RIZ-001', /^sac 25 kg/);
    await addLine(sales, '3*HUI-001', /^bouteille/);
    await expect(sales.getByRole('table')).toContainText('HUI-001');
    await shot(sales, '14-vente-devis');

    await sales.getByRole('button', { name: /^Quantité de la ligne 1/ }).click();
    const pad = region(sales, 'Ligne 1');
    await expect(pad).toBeVisible();
    await shot(sales, '15-vente-ligne');
    await pad.getByRole('button', { name: 'Fermer' }).click();

    await sales.getByRole('button', { name: 'Enregistrer le devis' }).click();
    await expect(band(sales)).toContainText('enregistré');
    await shot(sales, '16-vente-devis-enregistre');

    await sales.getByRole('button', { name: 'Valider la commande' }).click();
    await expect(sales.getByRole('dialog', { name: 'Commande validée' })).toBeVisible();
    ticket = /ticket (\S+) —/.exec((await band(sales).textContent()) ?? '')?.[1] ?? '';
    await shot(sales, '17-vente-commande-validee');
    await sales.getByRole('button', { name: 'Nouveau devis' }).click();
  });

  // A second order, left waiting at the register, from the same salesperson.
  await section('commercial-2', sales, async () => {
    await sales.getByRole('button', { name: 'Choisir le client' }).click();
    const customers = sales.getByRole('dialog', { name: 'Client du devis' });
    await customers.getByLabel('Téléphone ou nom du client').fill('Tsara');
    await customers.getByRole('button', { name: 'Épicerie Tsara Be' }).click();
    await addLine(sales, '10*SUC-001', /^kg/);
    await addLine(sales, '2*EAU-001', /^pack de 6/);
    await sales.getByRole('button', { name: 'Valider la commande' }).click();
    await expect(sales.getByRole('dialog', { name: 'Commande validée' })).toBeVisible();
    await sales.getByRole('button', { name: 'Nouveau devis' }).click();
    await sales.getByRole('button', { name: 'Mes devis et commandes' }).click();
    await sales.waitForTimeout(600);
    await shot(sales, '18-vente-mes-commandes');
  });

  // The cashier: open, call, control, discount asked to the owner.
  const register = await signIn(browser, 'caisse1');
  await section('caisse', register, async () => {
    const opening = region(register, registerLabels.openTitle);
    await opening.getByRole('button', { name: 'Caisse 1' }).click();
    await opening.getByLabel(registerLabels.openingFloat).fill('50 000');
    await shot(register, '30-caisse-ouverture');
    await opening.getByRole('button', { name: registerLabels.openRegister }).click();
    await expect(register.getByRole('button', { name: registerLabels.call(ticket) })).toBeVisible();
    await shot(register, '31-caisse-file');
    await register.getByRole('button', { name: registerLabels.call(ticket) }).click();
    await expect(
      register.getByRole('button', { name: registerLabels.pay, exact: true }),
    ).toBeVisible();
    await shot(register, '32-caisse-appel');

    await register.getByRole('button', { name: registerLabels.totalDiscount }).click();
    const discount = register.getByRole('dialog', { name: registerLabels.totalDiscount });
    await expect(discount).toBeVisible();
    await shot(register, '33-caisse-remise');
    await discount.getByRole('button', { name: 'Fermer' }).first().click();

    await register.getByRole('button', { name: 'Demander au boss' }).click();
    const ask = register.getByRole('dialog', { name: 'Demander une remise au boss' });
    await ask.getByLabel('Remise demandée, total').fill('10');
    await ask.getByLabel('Motif').selectOption({ index: 1 });
    await shot(register, '34-caisse-demande-boss');
    await ask.getByRole('button', { name: 'Envoyer au boss' }).click();
    await expect(band(register)).toContainText('Demande envoyée');
    await shot(register, '35-caisse-demande-attente');
  });

  // The owner answers the request.
  const owner = await signIn(browser, 'boss');
  await section('boss-demande', owner, async () => {
    const requests = region(owner, 'Demandes de remise');
    await expect(requests.getByRole('button', { name: 'Accorder' })).toBeVisible();
    await shot(owner, '50-boss-accueil');
    await shot(requests, '51-boss-demande');
    await requests.getByRole('button', { name: 'Accorder' }).first().click();
    await expect(band(owner)).toContainText('Remise accordée');
  });

  // Back at the register: the discount applied, split payment, invoice.
  await section('caisse-paiement', register, async () => {
    await expect(band(register)).toContainText('accordé');
    await shot(register, '36-caisse-remise-accordee');
    await register.getByRole('button', { name: registerLabels.pay, exact: true }).click();
    const payment = register.getByRole('dialog', {
      name: registerLabels.payTitle(ticket, CUSTOMER),
    });
    await payment.getByLabel(registerLabels.lineAmount, { exact: true }).first().fill('100 000');
    await payment.getByRole('button', { name: registerLabels.addMethod }).click();
    await payment.getByLabel(registerLabels.reference).fill('MP-240611-0042');
    await shot(register, '37-caisse-paiement');
    await payment.getByRole('button', { name: /^Encaisser .*MGA$/ }).click();
    await expect(register.getByRole('link', { name: registerLabels.openInvoice })).toBeVisible();
    await shot(register, '38-caisse-facture');
  });

  // The warehouse: take, prepare, call, hand over.
  const counter = await signIn(browser, 'magasin1');
  await section('livraison', counter, async () => {
    await expect(counter.getByRole('button', { name: deliveryLabels.take(ticket) })).toBeVisible();
    await shot(counter, '40-livraison-file');
    await counter.getByRole('button', { name: deliveryLabels.take(ticket) }).click();
    await expect(counter.getByRole('button', { name: deliveryLabels.ready })).toBeVisible();
    await shot(counter, '41-livraison-preparation');
    await counter.getByRole('button', { name: deliveryLabels.ready }).click();
    for (const position of [1, 2, 3])
      await counter.getByRole('checkbox', { name: deliveryLabels.handed(position) }).check();
    await shot(counter, '42-livraison-remise');
    await counter.getByRole('button', { name: deliveryLabels.deliver }).click();
    await expect(band(counter)).toContainText('livré');
  });

  // The public display, after the calls of the register and the counter.
  await section('ecran', register, async () => {
    const display = await open(browser);
    await display.goto('/ecran/DEMO-ECRAN');
    await display.waitForTimeout(1000);
    await register.getByRole('button', { name: registerLabels.callNext }).click();
    await display.waitForTimeout(1500);
    await shot(display, '45-ecran-public');
    await display.context().close();
    // Back in the queue: the register is free again, to be closed.
    await register.getByRole('button', { name: registerLabels.noShow }).click();
    await expect(register.getByRole('button', { name: 'Clôturer la caisse' })).toBeVisible();
  });

  // The kiosk: the self-service screen.
  await section('borne', admin, async () => {
    const link = region(admin, 'Postes du magasin').getByRole('link', {
      name: 'Adresse de la borne',
    });
    const href = await link.getAttribute('href');
    const kiosk = await open(browser);
    await kiosk.goto(href!);
    await kiosk.waitForTimeout(1500);
    await shot(kiosk, '46-borne');
    await kiosk.context().close();
  });

  // The cashier closes the register.
  await section('caisse-cloture', register, async () => {
    await register.getByRole('button', { name: 'Clôturer la caisse' }).click();
    const closing = register.getByRole('dialog');
    await expect(closing.getByText('Espèces attendues dans le tiroir')).toBeVisible();
    await closing.getByLabel('Espèces comptées (MGA)').fill('150 000');
    await shot(register, '39-caisse-cloture');
  });

  // The manager.
  const manager = await signIn(browser, 'responsable');
  await section('responsable', manager, async () => {
    await manager.waitForTimeout(800);
    await shot(manager, '70-responsable-supervision');
    await panels(manager, [
      ['Articles sous le seuil d’alerte', '71-responsable-stock'],
      ['Articles', '72-responsable-articles'],
      ['Import Excel des articles', '73-responsable-import'],
      ['Clients', '74-responsable-clients'],
      ['Journal d’audit', '76-responsable-audit'],
    ]);
    const exports = manager.locator('details', { hasText: 'Exports Excel' });
    await exports.locator('summary').click();
    await exports.scrollIntoViewIfNeeded();
    await shot(exports, '75-responsable-exports');
  });

  // The owner's other panels.
  await section('boss', owner, async () => {
    await owner.reload();
    await expect(panel(owner, 'Chiffres des ventes')).toBeVisible();
    await owner.waitForTimeout(800);
    await panels(owner, [
      ['Chiffres des ventes', '52-boss-chiffres'],
      ['Plafonds de remise', '53-boss-plafonds'],
      ['Règles de remise', '54-boss-regles'],
      ['Codes promo', '55-boss-codes'],
      ['Articles à proposer', '56-boss-a-proposer'],
    ]);
  });

  expect(failures, failures.join('\n')).toEqual([]);
});
