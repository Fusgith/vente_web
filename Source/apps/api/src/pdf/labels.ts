/** French wording of the printed documents (ADR-0004); the columns are those of the screen. */
export const QUOTE_PDF = {
  title: 'Devis',
  issuedOn: 'Date',
  validUntil: 'Valable jusqu’au',
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
  /** RG-FAC-06. */
  notice: (date: string) => `Devis — valable jusqu’au ${date} — ne vaut pas facture`,
  page: (number: string, current: number, count: number) =>
    `Devis ${number} — page ${current} sur ${count}`,
};
