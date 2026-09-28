/** The counters' wording (T-060, RG-LIV-01 à 03, ⚠️ H34); part of `labels` (`labels.delivery`). */
export const deliveryLabels = {
  queueTitle: 'File livraison',
  empty: 'Aucune commande à livrer : les commandes payées apparaissent ici.',
  take: (ticket: string) => `Prendre ${ticket}`,
  takeShort: 'Prendre',
  counterTitle: 'À votre comptoir',
  takeNext: 'Prendre la suivante',
  taking: 'Prise en charge…',
  next: (ticket: string, name: string) => `Suivante : ${ticket} — ${name}`,
  none: 'Aucune commande à livrer',
  /** Preparing (RG-LIV-02). */
  preparing: 'À préparer',
  orderTitle: (ticket: string, name: string) => `${ticket} — ${name}`,
  ready: 'Commande prête : appeler le client',
  /** Ready: the ticket called, the lines ticked as handed over (RG-LIV-03). */
  announce: 'Annoncez',
  handOver: 'Cochez chaque ligne remise au client',
  deliver: 'Livrer',
  delivering: 'Livraison…',
  noShow: 'Client absent',
  quantity: 'Quantité',
  unit: 'Unité',
  designation: 'Désignation',
  handed: (position: number) => `Ligne ${position} remise`,
  allTicked: 'Toutes les lignes sont cochées.',
  leftToTick: (count: number) =>
    count === 1 ? 'Encore 1 ligne à cocher.' : `Encore ${count} lignes à cocher.`,
  elsewhere: 'Aux autres comptoirs',
  heldBy: (name: string, station: string | null) =>
    station ? `${station} — ${name}` : `Comptoir de ${name}`,
  loadingOrder: 'Chargement de la commande…',
  /** Band messages, the ticket always with the customer's name (RG-TKT-03). */
  taken: (ticket: string, name: string) => `${ticket} — ${name} pris en charge : préparez-la.`,
  called: (ticket: string, name: string) => `Ticket ${ticket} appelé au comptoir : ${name}.`,
  delivered: (ticket: string, name: string) => `${ticket} — ${name} livré.`,
  absent: (ticket: string, name: string) => `${ticket} — ${name} absent : remis en fin de file.`,
};
