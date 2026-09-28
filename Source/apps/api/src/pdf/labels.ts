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
  /** RG-FAC-03, VAT-inclusive prices. */
  vatBase: 'Total HT',
  vat: (rate: string) => `TVA ${rate} %`,
  vatTotal: 'Total TTC',
  payments: 'Paiement',
  reference: (reference: string) => `réf. ${reference}`,
  cashReceived: 'Reçu en espèces',
  change: 'Rendu',
  page: (number: string, current: number, count: number) =>
    `Facture ${number} — page ${current} sur ${count}`,
};
