// Demo dataset for a development database. Everything here is fictitious.
// Business defaults follow CDC métier §13 (settings) and RG-PAY-01 (payment methods).

import type { Role, StationType } from '../../src/generated/prisma/enums.js';

/** Settings with their default values (CDC métier §13). `stations` is a table, not a setting. */
export const SETTINGS: Record<string, unknown> = {
  'store.legal': {
    name: 'Magasin de démonstration',
    address: 'Lot II A 12, Antananarivo 101',
    phone: '034 00 000 00',
    nif: '',
    stat: '',
    rcs: '',
    footer: 'Merci de votre visite',
  },
  currency: 'MGA',
  vat_enabled: false,
  vat_rate: 20,
  prices_include_vat: true,
  cash_rounding: 'none',
  invoice_prefix: 'F',
  credit_note_prefix: 'AV',
  quote_prefix: 'D',
  day_end_time: '23:59',
  quote_validity_days: 7,
  default_max_discount_pct: 0,
  // H60: the salesperson gives no discount until the admin allows it.
  sales_discount_enabled: false,
  'discount_code.length': 8,
  // H63: a promo code is proposed valid for this many days.
  promo_code_days: 30,
  customer_categories: ['Divers', 'Régulier', 'Gros contrat'],
  discount_reasons: ['Client fidèle', 'Achat en volume', 'Article abîmé', 'Geste commercial'],
  adjustment_reasons: ['Casse', 'Vol', 'Erreur de comptage', 'Périmé', 'Retour fournisseur'],
  allow_partial_payment: false,
  'display.enabled': false,
  'display.sound': true,
  'display.last_calls': 5,
  'session.lock_minutes.tablet': 5,
  'session.lock_minutes.register': 15,
};

/** Initial payment methods (RG-PAY-01); mobile money, card, transfer and cheque carry a reference. */
export const PAYMENT_METHODS = [
  { code: 'CASH', label: 'Espèces', requiresReference: false },
  { code: 'MVOLA', label: 'MVola', requiresReference: true },
  { code: 'ORANGE_MONEY', label: 'Orange Money', requiresReference: true },
  { code: 'AIRTEL_MONEY', label: 'Airtel Money', requiresReference: true },
  { code: 'CARD', label: 'Carte bancaire', requiresReference: true },
  { code: 'TRANSFER', label: 'Virement', requiresReference: true },
  { code: 'CHEQUE', label: 'Chèque', requiresReference: true },
  // The part of a sale left to pay later (H67), within the customer's credit conditions.
  { code: 'CREDIT', label: 'À crédit', requiresReference: false },
  // Paid later on a title, numbered, within the same conditions (H68).
  { code: 'BILL_OF_EXCHANGE', label: 'Traite', requiresReference: true },
  { code: 'POSTDATED_CHECK', label: 'Chèque post-daté', requiresReference: true },
] as const;

/** Demo credentials (development only; the seed refuses NODE_ENV=production). */
export const DEMO_PASSWORDS = {
  admin: 'Admin-1234!',
  boss: 'Boss-1234!',
  /** Every shop account (manager, sales, cashier, warehouse). */
  shop: 'Magasin-1234!',
} as const;
/** Fixed TOTP secret so the demo owner/admin can be added once to an authenticator app. */
export const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export interface DemoUser {
  username: string;
  fullName: string;
  roles: Role[];
  ticketLetter?: string;
  password: string;
  totpSecret?: string;
}

/**
 * One account per role, all logging in by identifier and password (RG-USR-03, H57); owner/admin
 * add a TOTP code outside the shop.
 */
export const USERS: DemoUser[] = [
  {
    username: 'admin',
    fullName: 'Administrateur',
    roles: ['admin'],
    password: DEMO_PASSWORDS.admin,
    totpSecret: DEMO_TOTP_SECRET,
  },
  {
    username: 'responsable',
    fullName: 'Rakoto Responsable',
    roles: ['manager'],
    password: DEMO_PASSWORDS.shop,
  },
  {
    username: 'vola',
    fullName: 'Vola Commerciale',
    roles: ['sales'],
    ticketLetter: 'A',
    password: DEMO_PASSWORDS.shop,
  },
  {
    username: 'hery',
    fullName: 'Hery Commercial',
    roles: ['sales'],
    ticketLetter: 'B',
    password: DEMO_PASSWORDS.shop,
  },
  {
    username: 'caisse1',
    fullName: 'Soa Caissière',
    roles: ['cashier'],
    password: DEMO_PASSWORDS.shop,
  },
  {
    username: 'magasin1',
    fullName: 'Feno Magasinier',
    roles: ['warehouse'],
    password: DEMO_PASSWORDS.shop,
  },
  {
    username: 'magasin2',
    fullName: 'Tahina Magasinière',
    roles: ['warehouse'],
    password: DEMO_PASSWORDS.shop,
  },
  {
    username: 'boss',
    fullName: 'Le Boss',
    roles: ['owner'],
    password: DEMO_PASSWORDS.boss,
    totpSecret: DEMO_TOTP_SECRET,
  },
];

export const STATIONS: {
  type: StationType;
  name: string;
  displayKey?: string;
  isActive?: boolean;
}[] = [
  { type: 'SALES', name: 'Tablette 1' },
  { type: 'SALES', name: 'Tablette 2' },
  { type: 'REGISTER', name: 'Caisse 1' },
  { type: 'REGISTER', name: 'Caisse 2' },
  { type: 'DELIVERY', name: 'Comptoir 1' },
  { type: 'DELIVERY', name: 'Comptoir 2' },
  // Optional public display (H11): declared but inactive, like `display.enabled = false`.
  { type: 'DISPLAY', name: 'Écran public', displayKey: 'DEMO-ECRAN', isActive: false },
];

export const CATEGORIES: { name: string; maxDiscountPct?: string }[] = [
  { name: 'Savons et hygiène', maxDiscountPct: '5' },
  { name: 'Alimentation' },
  { name: 'Boissons', maxDiscountPct: '3' },
  { name: 'Quincaillerie', maxDiscountPct: '10' },
];

export interface DemoUnit {
  label: string;
  factor: string;
  price: string;
  isBase?: boolean;
  barcode?: string;
  maxDiscountPct?: string;
}

export interface DemoProduct {
  sku: string;
  name: string;
  category: string;
  baseUnit: string;
  /** Initial stock in base unit, entered by the demo import batch. */
  stock: string;
  alertThreshold?: string;
  maxDiscountPct?: string;
  units: DemoUnit[];
}

/** Products with their price grid (RG-ART-06 example: SAV-001 pièce / paquet / carton). */
export const PRODUCTS: DemoProduct[] = [
  {
    sku: 'SAV-001',
    name: 'Savon de Marseille 200 g',
    category: 'Savons et hygiène',
    baseUnit: 'pièce',
    stock: '432',
    alertThreshold: '72',
    units: [
      { label: 'pièce', factor: '1', price: '4500', isBase: true, barcode: '3760000000017' },
      { label: 'paquet', factor: '6', price: '25000', barcode: '3760000000024' },
      { label: 'carton', factor: '72', price: '280000', maxDiscountPct: '8' },
    ],
  },
  {
    sku: 'SAV-002',
    name: 'Lessive en poudre 1 kg',
    category: 'Savons et hygiène',
    baseUnit: 'sachet',
    stock: '60',
    alertThreshold: '12',
    units: [
      { label: 'sachet', factor: '1', price: '8900', isBase: true, barcode: '3760000000031' },
      { label: 'carton', factor: '12', price: '99000' },
    ],
  },
  {
    sku: 'RIZ-001',
    name: 'Riz blanc makalioka',
    category: 'Alimentation',
    baseUnit: 'kg',
    stock: '1250.5',
    alertThreshold: '100',
    units: [
      { label: 'kg', factor: '1', price: '3200', isBase: true },
      { label: 'sac 25 kg', factor: '25', price: '76000' },
      { label: 'sac 50 kg', factor: '50', price: '150000', maxDiscountPct: '2' },
    ],
  },
  {
    sku: 'HUI-001',
    name: 'Huile végétale 1 L',
    category: 'Alimentation',
    baseUnit: 'bouteille',
    stock: '96',
    alertThreshold: '24',
    units: [
      { label: 'bouteille', factor: '1', price: '9800', isBase: true, barcode: '3760000000048' },
      { label: 'carton', factor: '12', price: '112000' },
    ],
  },
  {
    sku: 'SUC-001',
    name: 'Sucre blanc',
    category: 'Alimentation',
    baseUnit: 'kg',
    stock: '300',
    units: [
      { label: 'kg', factor: '1', price: '4200', isBase: true },
      { label: 'sac 50 kg', factor: '50', price: '200000' },
    ],
  },
  {
    sku: 'EAU-001',
    name: 'Eau minérale 1,5 L',
    category: 'Boissons',
    baseUnit: 'bouteille',
    stock: '180',
    alertThreshold: '36',
    units: [
      { label: 'bouteille', factor: '1', price: '2000', isBase: true, barcode: '3760000000055' },
      { label: 'pack de 6', factor: '6', price: '11000', barcode: '3760000000062' },
    ],
  },
  {
    sku: 'CLO-001',
    name: 'Clous 5 cm',
    category: 'Quincaillerie',
    baseUnit: 'kg',
    stock: '48.75',
    alertThreshold: '5',
    maxDiscountPct: '15',
    units: [{ label: 'kg', factor: '1', price: '6500', isBase: true }],
  },
  {
    sku: 'FIL-001',
    name: 'Fil électrique 2,5 mm²',
    category: 'Quincaillerie',
    baseUnit: 'm',
    stock: '500',
    units: [
      { label: 'm', factor: '1', price: '1800', isBase: true },
      { label: 'rouleau 100 m', factor: '100', price: '165000' },
    ],
  },
  {
    sku: 'TOL-001',
    name: 'Tôle ondulée 2 m',
    category: 'Quincaillerie',
    baseUnit: 'feuille',
    stock: '0',
    alertThreshold: '10',
    units: [{ label: 'feuille', factor: '1', price: '42000', isBase: true }],
  },
];

export const CUSTOMERS = [
  { name: 'Rasoanaivo Hanta', phone: '034 12 345 67', category: 'Régulier' },
  { name: 'Randriamanantena Jean', phone: '033 98 765 43' },
  { name: 'Épicerie Tsara Be', phone: '032 11 222 33' },
  { name: 'Ravelojaona Miora', phone: '034 55 666 77' },
  {
    name: 'Coopérative Fanantenana',
    phone: '020 22 333 44',
    category: 'Gros contrat',
    notes: 'Commande en gros chaque mois',
  },
];
