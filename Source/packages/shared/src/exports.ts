import { z } from 'zod';

import type { Role } from './auth.js';

/**
 * Excel exports (T-071, RG-EXP-01 à 03): the single source of their columns (CDC technique §9).
 * Headers are French and stable (RG-EXP-02); amounts and quantities stay numbers (RG-FMT-02).
 */
export const EXPORT_KINDS = [
  'sales',
  'payments',
  'discounts',
  'discountCodes',
  'closings',
  'stockMovements',
  'stock',
  'prices',
  'priceHistory',
  'queues',
  'customers',
  'audit',
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

/** How a cell is written: amounts in MGA, quantities, %, shop dates and times, plain text. */
export type ExportCell = 'text' | 'amount' | 'qty' | 'pct' | 'count' | 'date' | 'datetime';
export type ExportColumn = readonly [header: string, cell: ExportCell];

export interface ExportSheet {
  name: string;
  columns: readonly ExportColumn[];
}

export interface ExportDefinition {
  title: string;
  /** ASCII, without extension: `ventes-2026-10-01-2026-10-19.xlsx`. */
  file: string;
  /** A state at the time of the export: the period does not apply. */
  snapshot?: true;
  sheets: readonly ExportSheet[];
}

const invoice: ExportColumn = ['N° facture', 'text'];
const at: ExportColumn = ['Date', 'datetime'];
const sku: ExportColumn = ['Code article', 'text'];
const product: ExportColumn = ['Article', 'text'];
const baseUnit: ExportColumn = ['Unité de base', 'text'];
const station: ExportColumn = ['Caisse', 'text'];
const cashier: ExportColumn = ['Caissier', 'text'];
const opened: ExportColumn = ['Ouverture', 'datetime'];
const method: ExportColumn = ['Moyen de paiement', 'text'];

export const EXPORTS: Record<ExportKind, ExportDefinition> = {
  sales: {
    title: 'Ventes',
    file: 'ventes',
    sheets: [
      {
        name: 'Factures',
        columns: [
          invoice,
          at,
          ['Statut', 'text'],
          ['N° commande', 'text'],
          ['Client', 'text'],
          ['Téléphone', 'text'],
          ['Commercial', 'text'],
          cashier,
          ['Avant remise (MGA)', 'amount'],
          ['Remises (MGA)', 'amount'],
          ['Total (MGA)', 'amount'],
        ],
      },
      {
        name: 'Lignes',
        columns: [
          invoice,
          at,
          sku,
          product,
          ['Unité de vente', 'text'],
          ['Quantité', 'qty'],
          ['Facteur', 'qty'],
          ['Quantité en unité de base', 'qty'],
          baseUnit,
          ['Prix unitaire (MGA)', 'amount'],
          ['Remise de la ligne (MGA)', 'amount'],
          ['Montant de la ligne (MGA)', 'amount'],
          ['Part de la remise sur le total (MGA)', 'amount'],
          ['Net (MGA)', 'amount'],
        ],
      },
    ],
  },
  payments: {
    title: 'Encaissements',
    file: 'encaissements',
    sheets: [
      {
        name: 'Encaissements',
        columns: [
          at,
          invoice,
          station,
          cashier,
          method,
          ['Montant (MGA)', 'amount'],
          ['Référence', 'text'],
        ],
      },
      {
        name: 'Par moyen',
        columns: [method, ['Paiements', 'count'], ['Total (MGA)', 'amount']],
      },
    ],
  },
  discounts: {
    title: 'Remises accordées',
    file: 'remises',
    sheets: [
      {
        name: 'Remises',
        columns: [
          at,
          invoice,
          ['Client', 'text'],
          ['Commercial', 'text'],
          ['Porte sur', 'text'],
          sku,
          product,
          ['Remise (%)', 'pct'],
          ['Montant (MGA)', 'amount'],
          ['Origine', 'text'],
        ],
      },
    ],
  },
  discountCodes: {
    title: 'Codes de remise émis',
    file: 'codes-remise',
    sheets: [
      {
        name: 'Codes',
        columns: [
          ['Émis le', 'datetime'],
          ['Code', 'text'],
          ['Émis par', 'text'],
          ['Client', 'text'],
          ['N° commande', 'text'],
          ['Remises accordées', 'text'],
          ['Valable jusqu’au', 'datetime'],
          ['Statut', 'text'],
          ['Utilisé le', 'datetime'],
          ['Utilisé sur la commande', 'text'],
          ['Révoqué le', 'datetime'],
        ],
      },
    ],
  },
  closings: {
    title: 'Clôtures de caisse',
    file: 'clotures-caisse',
    sheets: [
      {
        name: 'Sessions',
        columns: [
          station,
          cashier,
          opened,
          ['Clôture', 'datetime'],
          ['Fond de caisse (MGA)', 'amount'],
          ['Encaissé (MGA)', 'amount'],
          ['Remboursé (MGA)', 'amount'],
          ['Espèces attendues (MGA)', 'amount'],
          ['Espèces comptées (MGA)', 'amount'],
          ['Écart (MGA)', 'amount'],
          ['Commentaire', 'text'],
        ],
      },
      {
        name: 'Par moyen',
        columns: [
          station,
          cashier,
          opened,
          method,
          ['Paiements', 'count'],
          ['Encaissé (MGA)', 'amount'],
          ['Remboursements', 'count'],
          ['Remboursé (MGA)', 'amount'],
        ],
      },
    ],
  },
  stockMovements: {
    title: 'Mouvements de stock',
    file: 'mouvements-stock',
    sheets: [
      {
        name: 'Mouvements',
        columns: [
          at,
          ['Type', 'text'],
          sku,
          product,
          ['Quantité en unité de base', 'qty'],
          baseUnit,
          ['Unité saisie', 'text'],
          ['Quantité saisie', 'qty'],
          ['N° commande', 'text'],
          ['Motif', 'text'],
          ['Auteur', 'text'],
        ],
      },
    ],
  },
  stock: {
    title: 'État du stock',
    file: 'etat-stock',
    snapshot: true,
    sheets: [
      {
        name: 'Stock',
        columns: [
          sku,
          product,
          ['Catégorie', 'text'],
          baseUnit,
          ['Théorique', 'qty'],
          ['Réservé', 'qty'],
          ['Disponible', 'qty'],
          ['Prix de l’unité de base (MGA)', 'amount'],
          ['Valeur du théorique (MGA)', 'amount'],
          ['Seuil d’alerte', 'qty'],
          ['Dernière entrée', 'datetime'],
        ],
      },
    ],
  },
  prices: {
    title: 'Grille de prix',
    file: 'grille-prix',
    snapshot: true,
    sheets: [
      {
        name: 'Prix',
        columns: [
          sku,
          product,
          ['Catégorie', 'text'],
          ['Unité de vente', 'text'],
          ['Facteur', 'qty'],
          baseUnit,
          ['Prix en vigueur (MGA)', 'amount'],
          ['En vigueur depuis', 'datetime'],
          ['Plafond de remise (%)', 'pct'],
        ],
      },
    ],
  },
  priceHistory: {
    title: 'Historique des prix',
    file: 'historique-prix',
    sheets: [
      {
        name: 'Historique',
        columns: [
          ['Date d’effet', 'datetime'],
          sku,
          product,
          ['Unité de vente', 'text'],
          ['Prix (MGA)', 'amount'],
          ['Prix précédent (MGA)', 'amount'],
          ['Variation (MGA)', 'amount'],
          ['Variation (%)', 'pct'],
          ['Fin de validité', 'datetime'],
          ['Origine', 'text'],
          ['Auteur', 'text'],
        ],
      },
    ],
  },
  queues: {
    title: 'Files d’attente',
    file: 'files-attente',
    sheets: [
      {
        name: 'Commandes',
        columns: [
          ['Ticket', 'text'],
          ['N° commande', 'text'],
          ['Client', 'text'],
          ['Commercial', 'text'],
          ['Validée à', 'datetime'],
          ['Appelée à', 'datetime'],
          ['Payée à', 'datetime'],
          ['Prête à', 'datetime'],
          ['Livrée à', 'datetime'],
          ['Attente à la caisse (min)', 'count'],
          ['Attente à la livraison (min)', 'count'],
          ['Absences', 'count'],
          ['Statut', 'text'],
        ],
      },
    ],
  },
  customers: {
    title: 'Clients',
    file: 'clients',
    snapshot: true,
    sheets: [
      {
        name: 'Clients',
        columns: [
          ['Nom', 'text'],
          ['Téléphone', 'text'],
          ['Second téléphone', 'text'],
          ['Catégorie', 'text'],
          ['Durée de réservation (jours)', 'count'],
          ['Notes', 'text'],
          ['Actif', 'text'],
          ['Créé le', 'datetime'],
        ],
      },
    ],
  },
  audit: {
    title: 'Journal d’audit',
    file: 'journal-audit',
    sheets: [
      {
        name: 'Journal',
        columns: [
          at,
          ['Utilisateur', 'text'],
          ['Rôle', 'text'],
          ['Poste', 'text'],
          ['Origine', 'text'],
          ['Action', 'text'],
          ['Objet', 'text'],
          ['Identifiant', 'text'],
          ['Avant', 'text'],
          ['Après', 'text'],
          ['Motif', 'text'],
        ],
      },
    ],
  },
};

/** The French words written in the cells for the stored codes. */
export const EXPORT_VALUES = {
  orderStatus: {
    DRAFT: 'Devis',
    SUBMITTED: 'Validée, en file',
    AT_REGISTER: 'À la caisse',
    PAID: 'Payée',
    PREPARING: 'En préparation',
    READY: 'Prête',
    ISSUE: 'Anomalie',
    DELIVERED: 'Livrée',
    EXPIRED: 'Expirée',
    CANCELLED: 'Annulée',
    REFUNDED: 'Remboursée',
    REPLACED: 'Remplacée',
  } as Record<string, string>,
  invoiceStatus: {
    ISSUED: 'Émise',
    CREDITED: 'Créditée',
    PARTIALLY_CREDITED: 'Partiellement créditée',
  } as Record<string, string>,
  discountSource: {
    NONE: '',
    WITHIN_CAP: 'Dans le plafond',
    RULE: 'Règle du boss',
    CODE: 'Code ou accord du boss',
  } as Record<string, string>,
  discountOn: { line: 'Ligne', order: 'Total' },
  movementType: {
    IMPORT: 'Import',
    ADJUSTMENT: 'Ajustement',
    DELIVERY: 'Livraison',
    RETURN: 'Retour',
    STOCKTAKE: 'Inventaire',
  } as Record<string, string>,
  codeStatus: {
    ACTIVE: 'Actif',
    USED: 'Utilisé',
    EXPIRED: 'Expiré',
    REVOKED: 'Révoqué',
  } as Record<string, string>,
  priceSource: { IMPORT: 'Import', MANUAL: 'Saisie' } as Record<string, string>,
  importOf: (fileName: string) => `Import du fichier ${fileName}`,
  origin: { LAN: 'Magasin', REMOTE: 'À distance' } as Record<string, string>,
  yes: 'Oui',
  no: 'Non',
  allProducts: 'Toute la commande',
} as const;

/** RG-EXP-03: the owner and the manager everything, the cashier their closings, the admin the journal. */
export function exportsFor(role: Role): ExportKind[] {
  if (role === 'owner' || role === 'manager') return [...EXPORT_KINDS];
  if (role === 'cashier') return ['closings'];
  if (role === 'admin') return ['audit'];
  return [];
}

/** A year at most, enough for a yearly closing and light on the shop's server. */
export const EXPORT_MAX_DAYS = 366;
const isoDate = z.iso.date();

export const exportQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine(({ from, to }) => from <= to, { path: ['to'] })
  .refine(({ from, to }) => Date.parse(to) - Date.parse(from) < EXPORT_MAX_DAYS * 86_400_000, {
    path: ['to'],
  });
export type ExportQuery = z.infer<typeof exportQuerySchema>;
