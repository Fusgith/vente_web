import { CURRENCY } from '@vente-web/shared';

/**
 * French wording of the printed documents (ADR-0004), shared by the quote and the invoice; the
 * columns are those of the screen.
 */
export const DOCUMENT_PDF = {
  issuedOn: 'Date',
  salesUser: 'Commercial',
  customer: 'Client',
  phone: (phone: string) => `Tél. ${phone}`,
  legalIds: { nif: 'NIF', stat: 'STAT', rcs: 'RCS' },
  columns: {
    number: 'N°',
    designation: 'Désignation',
    quantity: 'Quantité',
    unit: 'Unité',
    unitPrice: 'Prix unitaire',
    discount: 'Remise',
    netAmount: 'Montant net',
  },
  /** Under the head of each amount column, whose cells show the figures alone (RG-FMT-01). */
  inCurrency: `(${CURRENCY})`,
  factorOf: (factor: string, base: string) => `(× ${factor} ${base})`,
  grossTotal: 'Total brut',
  lineDiscounts: 'Remises sur les lignes',
  subtotal: 'Sous-total',
  orderDiscount: 'Remise sur le total',
  orderDiscountPct: (pct: string) => `Remise sur le total (${pct} %)`,
  total: 'Net à payer',
  discountTotal: 'Total des remises',
  minus: (amount: string) => `−${amount}`,
  pct: (pct: string) => `${pct} %`,
};

export const QUOTE_PDF = {
  ...DOCUMENT_PDF,
  title: 'Devis',
  validUntil: 'Valable jusqu’au',
  /** RG-FAC-06. */
  notice: (date: string) => `Devis — valable jusqu’au ${date} — ne vaut pas facture`,
  page: (number: string, current: number, count: number) =>
    `Devis ${number} — page ${current} sur ${count}`,
};

/** The invoice (RG-FAC-02, H33). */
export const INVOICE_PDF = {
  ...DOCUMENT_PDF,
  title: 'Facture',
  time: 'Heure',
  ticket: 'Ticket',
  order: 'Commande',
  cashier: 'Caissier',
  /** RG-REM-07. */
  /** RG-REM-07, H63. */
  discountCode: 'Code promo',
  /** H64: the owner's answer to a request, without its code. */
  ownerDiscount: 'Remise',
  grantedByOwner: 'Accordée par le boss',
  /** RG-FAC-03, VAT-inclusive prices. */
  vatBase: 'Total HT',
  vat: (rate: string) => `TVA ${rate} %`,
  vatTotal: 'Total TTC',
  /** RG-FMT-04, H70: the total before the cash rounding, when VAT is off. */
  invoiceTotal: 'Total de la facture',
  cashRounding: 'Arrondi espèces',
  payments: 'Paiement',
  reference: (reference: string) => `réf. ${reference}`,
  cashReceived: 'Reçu en espèces',
  change: 'Rendu',
  page: (number: string, current: number, count: number) =>
    `Facture ${number} — page ${current} sur ${count}`,
};

/** The register closing report (RG-CAI-03, H35). */
export const CLOSING_PDF = {
  title: 'Clôture de caisse',
  open: 'Session ouverte',
  register: 'Caisse',
  cashier: 'Caissier',
  openedAt: 'Ouverture',
  closedAt: 'Clôture',
  notClosed: 'non clôturée',
  byMethod: 'Encaissements par moyen de paiement',
  method: 'Moyen',
  payments: 'Paiements',
  total: 'Total',
  inCurrency: `(${CURRENCY})`,
  cash: 'Espèces',
  openingFloat: 'Fond de caisse',
  cashTaken: 'Espèces encaissées',
  cashRefunded: 'Espèces remboursées',
  refunds: 'Remboursements (avoirs)',
  creditNotes: 'Avoirs',
  cashExpected: 'Espèces attendues',
  countedCash: 'Espèces comptées',
  variance: 'Écart',
  note: 'Commentaire',
  invoices: 'Factures de la session',
  invoice: 'Facture',
  amount: 'Montant',
  none: 'Aucun paiement.',
  at: (date: string, time: string) => `${date} à ${time}`,
  page: (register: string, current: number, count: number) =>
    `Clôture ${register} — page ${current} sur ${count}`,
};

/** The credit note (RG-FAC-05, H36). */
export const CREDIT_NOTE_PDF = {
  ...DOCUMENT_PDF,
  title: 'Avoir',
  time: 'Heure',
  invoice: 'Facture d’origine',
  ticket: 'Ticket',
  cashier: 'Caissier',
  approvedBy: 'Validé par',
  decidedBy: 'Décidé par',
  invoiceTotal: 'Total de la facture',
  notHandedOver: 'Non remis à la livraison',
  creditedColumns: ['Désignation', 'Quantité', 'Cause', 'Crédité (MGA)'],
  causes: { MISSING: 'Manquant', DAMAGED: 'Abîmé' },
  partialReason: (causes: string, note: string | null) =>
    `Livraison partielle (${causes})${note ? ` : ${note}` : ''}`,
  credited: 'Montant de l’avoir',
  reason: 'Motif',
  refund: 'Remboursement',
  reference: (reference: string) => `réf. ${reference}`,
  notice: (invoice: string) =>
    `Avoir sur la facture ${invoice} — la facture d’origine reste inchangée`,
  page: (number: string, current: number, count: number) =>
    `Avoir ${number} — page ${current} sur ${count}`,
};
