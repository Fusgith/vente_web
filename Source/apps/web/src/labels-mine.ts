import type { OPEN_ORDER_STATUSES } from '@vente-web/shared';

/**
 * The salesperson's quotes and orders on the tablet (T-035b, RG-DEV-02/03, RG-CMD-05b/08, H56):
 * `labels.mine`.
 */
export const mineLabels = {
  open: 'Mes devis et commandes',
  title: 'Mes devis et commandes',
  close: 'Fermer',
  search: 'Numéro du devis',
  searchHint: 'Le numéro d’un devis, même d’un collègue. Vide : vos devis et commandes en cours.',
  find: 'Chercher',
  showAll: 'Tout afficher',
  list: 'Devis et commandes en cours',
  loading: 'Chargement…',
  empty: 'Aucun devis ni commande en cours : vos devis enregistrés s’afficheront ici.',
  notFound: (number: string) =>
    `Aucun devis ni commande en cours ne porte le numéro « ${number} ».`,
  head: {
    number: 'Numéro',
    customer: 'Client',
    status: 'État',
    total: 'Total (MGA)',
  },
  status: {
    DRAFT: 'Devis',
    SUBMITTED: 'Validée, en file',
    AT_REGISTER: 'À la caisse',
    EXPIRED: 'Expirée',
  } satisfies Record<(typeof OPEN_ORDER_STATUSES)[number], string>,
  ticket: (ticket: string) => `Ticket ${ticket}`,
  /** A quote with a ticket: an order sent back by the register (H56). */
  sentBack: 'Renvoyée par la caisse',
  /** A quote past its validity (RG-DEV-02): taken up, it is priced again on saving. */
  outdated: 'Périmé',
  by: (name: string) => `Commercial : ${name}`,
  takeUp: 'Reprendre',
  takeUpOf: (number: string) => `Reprendre le devis ${number}`,
  cancel: 'Annuler',
  cancelOf: (number: string) => `Annuler la commande ${number}`,
  reactivate: 'Réactiver',
  reactivateOf: (number: string) => `Réactiver la commande ${number}`,
  replaceTitle: 'Remplacer le devis à l’écran ?',
  replaceHint: (number: string) =>
    `Le devis à l’écran a des modifications non enregistrées : elles seront perdues si vous reprenez le devis ${number}.`,
  replace: 'Reprendre quand même',
  keep: 'Garder l’écran',
  takenUp: (number: string) => `Devis ${number} repris : modifiez-le, enregistrez puis validez.`,
  reactivated: (ticket: string, name: string) =>
    `Commande ${ticket} de ${name} réactivée : en fin de file à la caisse.`,
  /** Reactivation refused (H56): the order is a quote again, to correct and validate. */
  becameQuote: (number: string) =>
    `La commande ${number} est redevenue un devis : reprenez-le, corrigez puis validez.`,
  /** The register sent the order back (RG-CMD-05b, H56). */
  sentBackNotice: (ticket: string, name: string) =>
    `Commande ${ticket} de ${name} renvoyée par la caisse : reprenez-la dans « Mes devis et commandes ».`,
};
