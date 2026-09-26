import type { AuthMe, AuthUserDirectory, CategorySummary, ProductHit } from '@vente-web/shared';

/**
 * Demo data of the design gallery (dev only): the articles and people of the design brief, so
 * every screen can be looked at without a server or a login.
 */
const id = (n: number) => `0192a4f0-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** About two dozen, as in a real general store (20 to 45): the picker must hold them all. */
const CATEGORY_NAMES = [
  'Alimentation',
  'Savons et hygiène',
  'Quincaillerie',
  'Papeterie',
  'Riz et céréales',
  'Huiles et graisses',
  'Sucre et café',
  'Conserves',
  'Boissons',
  'Lessive et entretien',
  'Électricité',
  'Plomberie',
  'Peinture',
  'Fournitures scolaires',
  'Ustensiles de cuisine',
  'Plastiques',
  'Textile et lamba',
  'Bougies et éclairage',
  'Piles et ampoules',
  'Cosmétiques',
  'Bébé',
  'Animaux',
  'Jardinage',
  'Divers',
];

export const CATEGORIES: CategorySummary[] = CATEGORY_NAMES.map((name, index) => ({
  id: id(201 + index),
  name,
}));

function category(name: string): CategorySummary {
  const found = CATEGORIES.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No category ${name}`);
  return found;
}
const FOOD = category('Alimentation');
const SOAP = category('Savons et hygiène');
const HARDWARE = category('Quincaillerie');
const PAPER = category('Papeterie');

type Unit = [label: string, factor: string, price: string | null, cap: string | null];

let nextUnit = 1000;
function product(
  n: number,
  sku: string,
  name: string,
  category: CategorySummary,
  available: string,
  units: Unit[],
): ProductHit {
  const base = units[0]?.[0] ?? 'pièce';
  return {
    id: id(n),
    sku,
    name,
    category,
    baseUnit: base,
    available,
    units: units.map(([label, factor, price, maxDiscountPct]) => ({
      id: id(nextUnit++),
      label,
      factor,
      isBase: factor === '1',
      barcode: null,
      price,
      maxDiscountPct,
    })),
  };
}

export const PRODUCTS = {
  savon: product(101, 'SAV-001', 'Savon de Marseille 400 g', SOAP, '420', [
    ['pièce', '1', '1500', '5'],
    ['paquet', '6', '8500', '5'],
    ['carton', '72', null, '8'],
  ]),
  savonNoir: product(102, 'SAV-014', 'Savon noir 250 g', SOAP, '96', [
    ['pièce', '1', '1200', null],
    ['paquet', '12', '13800', null],
  ]),
  lessive: product(103, 'LES-003', 'Lessive en poudre 1 kg', SOAP, '38', [
    ['sachet', '1', '6500', '3'],
    ['carton', '10', '62000', '3'],
  ]),
  riz: product(104, 'RIZ-001', 'Riz blanc', FOOD, '1250.5', [
    ['kg', '1', '3200', null],
    ['sac 50 kg', '50', '150000', null],
  ]),
  huile: product(105, 'HUI-002', 'Huile de soja 1 L', FOOD, '240', [
    ['bouteille', '1', '9800', '5'],
    ['carton', '12', '112000', '5'],
  ]),
  sucre: product(106, 'SUC-001', 'Sucre roux', FOOD, '800', [
    ['kg', '1', '4200', '2'],
    ['sac 50 kg', '50', '205000', '2'],
  ]),
  bougies: product(107, 'BOU-010', 'Bougies blanches', HARDWARE, '960', [
    ['pièce', '1', '500', '5'],
    ['paquet', '8', '3600', '5'],
  ]),
  clous: product(108, 'CLO-050', 'Clous 50 mm', HARDWARE, '64.5', [['kg', '1', '9000', '3']]),
  cahier: product(109, 'CAH-100', 'Cahier 100 pages', PAPER, '310', [
    ['pièce', '1', '1800', null],
    ['paquet', '10', '17000', null],
  ]),
  // More soaps, so « sav » finds more than SEARCH_MAX_RESULTS articles (the refine notice).
  savon200: product(110, 'SAV-002', 'Savon de Marseille 200 g', SOAP, '600', [
    ['pièce', '1', '900', '5'],
    ['paquet', '12', '10200', '5'],
  ]),
  savonLiquide: product(111, 'SAV-020', 'Savon liquide 500 mL', SOAP, '54', [
    ['flacon', '1', '4500', '5'],
  ]),
  savonnette: product(112, 'SAV-031', 'Savonnette parfumée 90 g', category('Cosmétiques'), '180', [
    ['pièce', '1', '1100', null],
    ['paquet', '4', '4200', null],
  ]),
  savonMenage: product(
    113,
    'SAV-040',
    'Savon de ménage 300 g',
    category('Lessive et entretien'),
    '350',
    [
      ['pièce', '1', '1300', '5'],
      ['carton', '48', '58000', '8'],
    ],
  ),
  savonBebe: product(114, 'SAV-052', 'Savon bébé 100 g', category('Bébé'), '72', [
    ['pièce', '1', '2500', null],
  ]),
  savonCitron: product(115, 'SAV-060', 'Savon au citron 150 g', SOAP, '0', [
    ['pièce', '1', '1400', '5'],
  ]),
  savonBarbe: product(116, 'SAV-075', 'Savon à barbe', category('Cosmétiques'), '24', [
    ['pièce', '1', '3500', null],
  ]),
  cafe: product(117, 'CAF-001', 'Café moulu 250 g', category('Sucre et café'), '130', [
    ['sachet', '1', '5200', '3'],
  ]),
  sel: product(118, 'SEL-001', 'Sel fin 1 kg', FOOD, '410', [
    ['sachet', '1', '1000', null],
    ['carton', '20', '19000', null],
  ]),
  allumettes: product(119, 'ALL-010', 'Allumettes', category('Divers'), '1500', [
    ['boîte', '1', '100', null],
    ['paquet', '10', '900', null],
  ]),
  piles: product(120, 'PIL-006', 'Piles AA', category('Piles et ampoules'), '288', [
    ['pièce', '1', '800', '5'],
    ['blister', '4', '3000', '5'],
  ]),
  lamba: product(
    121,
    'LAM-001',
    'Lamba arindrano coton blanc 2 m',
    category('Textile et lamba'),
    '15',
    [['pièce', '1', '45000', '10']],
  ),
} satisfies Record<string, ProductHit>;

export const FAVORITES = [
  PRODUCTS.riz,
  PRODUCTS.savon,
  PRODUCTS.huile,
  PRODUCTS.sucre,
  PRODUCTS.bougies,
  PRODUCTS.cahier,
  PRODUCTS.lessive,
  PRODUCTS.clous,
  PRODUCTS.cafe,
  PRODUCTS.sel,
  PRODUCTS.allumettes,
  PRODUCTS.piles,
];

export const DIRECTORY: AuthUserDirectory = {
  users: [
    { id: id(1), username: 'vola', fullName: 'Vola Commerciale', roles: ['sales'] },
    { id: id(2), username: 'hery', fullName: 'Hery Commercial', roles: ['sales'] },
    { id: id(3), username: 'rakoto', fullName: 'Rakoto Responsable', roles: ['manager', 'sales'] },
    { id: id(4), username: 'soa', fullName: 'Soa Caissière', roles: ['cashier'] },
    { id: id(5), username: 'feno', fullName: 'Feno Magasinier', roles: ['warehouse'] },
    { id: id(6), username: 'tahina', fullName: 'Tahina Magasinière', roles: ['warehouse'] },
  ],
};

export function demoMe(role: AuthMe['session']['activeRole']): AuthMe {
  const rakoto = role === 'manager';
  return {
    user: {
      id: id(rakoto ? 3 : 1),
      username: rakoto ? 'rakoto' : 'vola',
      fullName: rakoto ? 'Rakoto Responsable' : 'Vola Commerciale',
      roles: rakoto ? ['manager', 'sales'] : [role],
      totpEnabled: false,
    },
    session: {
      activeRole: role,
      origin: 'LAN',
      authMethod: 'PIN',
      stationId: null,
      expiresAt: '2026-09-25T20:00:00.000Z',
      idleMinutes: 5,
    },
  };
}
