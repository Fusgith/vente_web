import { computeQuote, type Order, type ProductHit } from '@vente-web/shared';
import { useEffect, useMemo, type ReactNode } from 'react';

import { AuthContext, type AuthContextValue, type AuthState } from '../auth/context.js';
import { LoginScreen } from '../auth/LoginScreen.js';
import { labels } from '../labels.js';
import { quoteInput } from '../sales/discount-entry.js';
import { draftReducer, emptyDraft, saveSignature, type DraftState } from '../sales/draft.js';
import { SalesWorkspace } from '../sales/SalesWorkspace.js';
import { AppShell } from '../shell/AppShell.js';
import { Frame } from '../shell/Frame.js';
import { useStatusLine } from '../shell/status-line.js';
import { buttonClass } from '../ui/button.js';
import { installDemoApi } from './demo-api.js';
import { demoMe, PRODUCTS } from './fixtures.js';

/**
 * Dev-only gallery (`/__design?screen=…`): the real screens fed with demo data, to look at the
 * design on a tablet or in screenshots without a server or a PIN. Never part of a build.
 */
installDemoApi();

const SCREENS = {
  connexion: 'Connexion : choix du nom',
  pin: 'Connexion : code PIN après verrouillage',
  'mot-de-passe': 'Connexion par mot de passe',
  devis: 'Devis : recherche « sav » et cinq lignes',
  'devis-pave': 'Devis : pavé de quantité ouvert sur la ligne 3',
  'devis-vide': 'Devis vide : les plus vendus',
  'devis-long': 'Devis long : quinze lignes, la dernière au pavé, le total visible',
  'devis-erreur': 'Devis : code scanné inconnu, l’erreur dans la bande du bas',
  'devis-categories': 'Devis : choix de la catégorie ouvert',
  'devis-enregistre': 'Devis enregistré : son numéro, rien à enregistrer',
  'commande-validee': 'Commande validée : le ticket en grand avec le nom du client',
  'commande-stock': 'Validation refusée : stock insuffisant, quantités proposées',
  caisse: 'Caisse : la file, le suivant à appeler',
  'caisse-appel': 'Caisse : client appelé, ticket et nom à annoncer',
  responsable: 'Responsable : deux rôles, le choix du rôle actif',
} as const;
type Screen = keyof typeof SCREENS;

function unitId(hit: ProductHit, label: string): string {
  const unit = hit.units.find((candidate) => candidate.label === label);
  if (!unit) throw new Error(`No unit ${label} on ${hit.sku}`);
  return unit.id;
}

type Pick = [hit: ProductHit, unit: string, qty: string];

/** The five lines of the design brief. */
const FIVE_LINES: Pick[] = [
  [PRODUCTS.savon, 'pièce', '3'],
  [PRODUCTS.riz, 'sac 50 kg', '1'],
  [PRODUCTS.huile, 'bouteille', '6'],
  [PRODUCTS.sucre, 'kg', '12.5'],
  [PRODUCTS.bougies, 'paquet', '2'],
];

/** Fifteen lines: the table scrolls inside the sheet while the total stays in view. */
const FIFTEEN_LINES: Pick[] = [
  ...FIVE_LINES,
  [PRODUCTS.lessive, 'carton', '2'],
  [PRODUCTS.clous, 'kg', '4.5'],
  [PRODUCTS.cahier, 'paquet', '3'],
  [PRODUCTS.savonNoir, 'paquet', '1'],
  [PRODUCTS.cafe, 'sachet', '10'],
  [PRODUCTS.sel, 'carton', '1'],
  [PRODUCTS.allumettes, 'paquet', '5'],
  [PRODUCTS.piles, 'blister', '6'],
  [PRODUCTS.savonMenage, 'pièce', '24'],
  [PRODUCTS.lamba, 'pièce', '1'],
];

/** Builds the lines through the real reducer; `padOnLine` (1-based) opens the pad on a line. */
function demoDraft(picks: Pick[], padOnLine: number | null = null): DraftState {
  const draft = picks.reduce(
    (state, [hit, unit, qty]) =>
      draftReducer(state, { type: 'add', hit, unitId: unitId(hit, unit), qty }),
    emptyDraft,
  );
  const selected = padOnLine === null ? null : (draft.lines[padOnLine - 1]?.key ?? null);
  return { ...draft, selected };
}

/** Saved under its number, nothing changed since: the status says so, the save rests. */
function savedDraft(): DraftState {
  const draft: DraftState = {
    ...demoDraft(FIVE_LINES),
    customer: {
      id: '0192a4f0-0000-7000-8000-000000000301',
      name: 'Rasoa Hanta',
      phone: '0341122233',
    },
  };
  const saved = {
    id: '0192a4f0-0000-7000-8000-000000000401',
    number: 'D-2026-000042',
    version: 1,
    body: saveSignature(draft),
  };
  return { ...draft, saved };
}

/** Validated: the ticket over the quote, as the tablet shows it across the counter (T-032). */
function orderedDraft(): DraftState {
  const draft = savedDraft();
  const totals = computeQuote(quoteInput(draft));
  const order: Order = {
    id: draft.saved!.id,
    number: draft.saved!.number,
    version: 2,
    customer: draft.customer!,
    salesUser: { id: '0192a4f0-0000-7000-8000-000000000501', fullName: 'Rakoto Vola' },
    lines: [],
    grossTotal: totals.grossTotal,
    lineDiscounts: totals.lineDiscounts,
    subtotal: totals.subtotal,
    orderDiscountPct: totals.orderDiscountPct,
    orderDiscount: totals.orderDiscount,
    discountTotal: totals.discountTotal,
    discountCode: null,
    total: totals.total,
    createdAt: '2026-09-26T07:00:00.000Z',
    updatedAt: '2026-09-26T07:05:00.000Z',
    status: 'SUBMITTED',
    ticket: { letter: 'A', seq: 15, date: '2026-09-26' },
    submittedAt: '2026-09-26T07:05:00.000Z',
    expiresAt: '2026-09-26T20:59:00.000Z',
  };
  return { ...draft, order };
}

/** Refused for want of stock (RG-CMD-02): the rice sack and the oil, each on one line. */
function shortDraft(): DraftState {
  const draft = savedDraft();
  const shortage = (position: number, available: string, requested: string) => {
    const { product } = draft.lines[position - 1]!;
    const { id: productId, sku, name, baseUnit } = product;
    return { productId, sku, name, baseUnit, available, requested, lines: [position] };
  };
  return draftReducer(draft, {
    type: 'short',
    shortages: [shortage(2, '40.00', '50.00'), shortage(3, '4.00', '6.00')],
  });
}

const SCAN_ERROR: News = { tone: 'error', text: labels.sales.unknownCode('8712345678906') };

const noop = () => undefined;
const resolved = () => Promise.resolve();

function DemoAuth({ state, children }: { state: AuthState; children: ReactNode }) {
  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: resolved,
      signOut: resolved,
      lock: noop,
      switchRole: resolved,
      keepAlive: noop,
    }),
    [state],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

/** Types into the search field as a user would, once the screen is mounted. */
function useTypedSearch(text: string | null) {
  useEffect(() => {
    if (!text) return;
    const input = document.querySelector<HTMLInputElement>('input[type="search"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!input || !setValue) return;
    setValue.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, [text]);
}

/** Presses PIN digits on the keyboard, as on a register PC. */
function useTypedPin(digits: string | null) {
  useEffect(() => {
    if (!digits) return;
    const timer = window.setTimeout(() => {
      for (const key of digits) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    }, 50);
    return () => window.clearTimeout(timer);
  }, [digits]);
}

/** What the bottom band says on a sales screen: the last line added, or a scan error. */
interface News {
  tone: 'info' | 'error';
  text: string;
}

const ADDED: News = {
  tone: 'info',
  text: labels.sales.added('3', 'pièce', 'Savon de Marseille 400 g'),
};

/** Says `news` in the bottom band once mounted, as the workspace does after a tap or a scan. */
function DemoNews({ news }: { news: News | null }) {
  const { say, sayError } = useStatusLine();
  useEffect(() => {
    if (news?.tone === 'info') say(news.text, 'check');
    if (news?.tone === 'error') sayError(news.text);
  }, [news, say, sayError]);
  return null;
}

interface SalesProps {
  draft: DraftState;
  search: string | null;
  news?: News | null;
}

function Sales({ draft, search, news = null }: SalesProps) {
  useTypedSearch(search);
  const me = demoMe('sales');
  return (
    <DemoAuth state={{ status: 'authenticated', me }}>
      <AppShell me={me} realtime={false}>
        <SalesWorkspace initialDraft={draft} />
        <DemoNews news={news} />
      </AppShell>
    </DemoAuth>
  );
}

/**
 * Clicks the first element matching `selector` once the screen has settled (the demo API answers
 * on the next tick), to show a state behind a tap: the password form, the category sheet.
 */
function useAutoClick(selector: string | ((element: HTMLElement) => boolean)) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const target =
        typeof selector === 'string'
          ? document.querySelector<HTMLElement>(selector)
          : [...document.querySelectorAll<HTMLElement>('button')].find(selector);
      target?.click();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [selector]);
}

const anonymous: AuthState = { status: 'anonymous', notice: null, resume: null };

function Pin() {
  useTypedPin('123');
  return (
    <DemoAuth state={anonymous}>
      <LoginScreen
        notice={labels.session.locked(5)}
        resume={{ username: 'rakoto', role: 'sales' }}
      />
    </DemoAuth>
  );
}

const isPasswordLink = (button: HTMLElement) => button.textContent === labels.login.passwordLink;

function Password() {
  useAutoClick(isPasswordLink);
  return (
    <DemoAuth state={anonymous}>
      <LoginScreen notice={null} resume={null} />
    </DemoAuth>
  );
}

/** The category trigger of the tool pane carries `data-category-trigger` (Sales workspace). */
function SalesCategories() {
  useAutoClick('[data-category-trigger]');
  return <Sales draft={demoDraft(FIVE_LINES)} search={null} />;
}

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'connexion':
      return (
        <DemoAuth state={anonymous}>
          <LoginScreen notice={null} resume={null} />
        </DemoAuth>
      );
    case 'pin':
      return <Pin />;
    case 'mot-de-passe':
      return <Password />;
    case 'devis':
      return <Sales draft={demoDraft(FIVE_LINES)} search="sav" news={ADDED} />;
    case 'devis-pave':
      // Typing closes the pad (the field is for searching): the pad screen types nothing.
      return <Sales draft={demoDraft(FIVE_LINES, 3)} search={null} news={ADDED} />;
    case 'devis-vide':
      return <Sales draft={emptyDraft} search={null} />;
    case 'devis-long':
      return <Sales draft={demoDraft(FIFTEEN_LINES, 15)} search={null} news={ADDED} />;
    case 'devis-erreur':
      return <Sales draft={demoDraft(FIVE_LINES)} search={null} news={SCAN_ERROR} />;
    case 'devis-categories':
      return <SalesCategories />;
    case 'devis-enregistre':
      return <Sales draft={savedDraft()} search={null} />;
    case 'commande-validee':
      return <Sales draft={orderedDraft()} search={null} />;
    case 'commande-stock':
      return <Sales draft={shortDraft()} search={null} />;
    case 'caisse':
    case 'caisse-appel':
    case 'responsable': {
      const me = demoMe(screen === 'responsable' ? 'manager' : 'cashier');
      return (
        <DemoAuth state={{ status: 'authenticated', me }}>
          <AppShell me={me} realtime={false} />
        </DemoAuth>
      );
    }
  }
}

/** The screen list, in the frame too: every screen one tap away. */
export function DesignGallery() {
  const requested = new URLSearchParams(window.location.search).get('screen');
  if (requested && requested in SCREENS) return <ScreenView screen={requested as Screen} />;
  return (
    <Frame
      workspace="login"
      name="Galerie de design"
      wordmarkHeading
      note="Chaque écran est servi par des données de démonstration, sans serveur."
      noteIcon="info"
    >
      <nav aria-label="Écrans" className="mx-auto w-full max-w-2xl py-6">
        <h2 className="type-title mb-4">Écrans</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(SCREENS).map(([key, title]) => (
            <li key={key}>
              <a
                href={`?screen=${key}`}
                className={buttonClass('secondary', 'lg', 'w-full justify-start text-left')}
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </Frame>
  );
}
