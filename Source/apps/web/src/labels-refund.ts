const AT_COUNTER =
  'La marchandise est au comptoir de livraison : le responsable doit d’abord la remettre en file.';

/** Cancelling a paid sale, refund and credit note (T-053, RG-ANN-02, H36); `labels.refund`. */
export const refundLabels = {
  open: 'Annuler ou rembourser une vente',
  title: 'Annuler ou rembourser une vente',
  close: 'Fermer',
  invoiceNumber: 'Numéro de la facture',
  find: 'Rechercher',
  finding: 'Recherche…',
  found: (ticket: string, name: string) => `Vente ${ticket} — ${name}`,
  invoiceOf: (number: string, date: string) => `Facture ${number} du ${date}`,
  paidWith: 'Payée par',
  total: 'Montant à rembourser',
  /** Why a sale found cannot be cancelled here, by its status. */
  notRefundable: (status: string) =>
    ({
      PREPARING: AT_COUNTER,
      READY: AT_COUNTER,
      ISSUE: AT_COUNTER,
      DELIVERED: 'La marchandise est déjà livrée : l’annulation n’est plus possible ici.',
      REFUNDED: 'Cette vente est déjà annulée et remboursée.',
    })[status] ?? 'Cette vente ne peut pas être annulée ici.',
  reason: 'Motif de l’annulation',
  method: 'Remboursé en',
  reference: 'Référence du remboursement (obligatoire)',
  approval: 'Validation du responsable, sur place',
  manager: 'Identifiant du responsable',
  password: 'Mot de passe du responsable',
  confirm: (amount: string) => `Annuler la vente et rembourser ${amount}`,
  refunding: 'Annulation…',
  done: (creditNote: string, amount: string, method: string) =>
    `Avoir ${creditNote} émis. Rendez ${amount} au client (${method}).`,
  openCreditNote: 'Ouvrir l’avoir',
  /** A credit note already issued on the sale found, to reprint. */
  creditNoteOf: (number: string) => `Ouvrir l’avoir ${number}`,
  finish: 'Terminer',
  /** In the status line, once done. */
  refunded: (ticket: string, name: string, creditNote: string) =>
    `Vente ${ticket} — ${name} annulée : avoir ${creditNote}.`,
};
