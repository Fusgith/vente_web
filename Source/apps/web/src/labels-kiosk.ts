/** The self-service kiosk's wording (T-036, RG-BOR-01 à 06); part of `labels` (`labels.kiosk`). */
export const kioskLabels = {
  welcome: 'Préparez votre panier',
  searchLabel: 'Rechercher un article',
  searchPlaceholder: 'Nom, code ou code-barres',
  favorites: 'Les plus vendus',
  noResult: 'Aucun article trouvé.',
  soldOut: 'Épuisé',
  /** Unit button: « paquet 25 000,00 MGA ». */
  unit: (label: string, price: string) => `${label} ${price}`,
  basket: 'Mon panier',
  emptyBasket: 'Touchez un article pour l’ajouter.',
  columns: {
    product: 'Article',
    unit: 'Unité',
    qty: 'Qté',
    price: 'PU (MGA)',
    amount: 'Montant (MGA)',
  },
  total: 'Total (MGA)',
  quantityOf: (name: string) => `Quantité : ${name}`,
  comma: 'Virgule',
  erase: 'Effacer un chiffre',
  remove: 'Retirer',
  finish: 'Terminer',
  back: 'Retour',
  name: 'Votre nom',
  phone: 'Votre téléphone',
  send: 'Envoyer le panier',
  sending: 'Envoi…',
  invalid: 'Indiquez votre nom et un numéro de téléphone valide.',
  sentTitle: 'Votre numéro de panier',
  sentCall: 'Un commercial va vous appeler.',
  newBasket: 'Nouveau panier',
  unknown: 'Borne indisponible : clé inconnue ou borne désactivée.',
  offline: 'Connexion perdue : réessayez dans un instant.',
};

/** The salespeople's list of baskets sent by the kiosk (RG-BOR-04/05). */
export const kioskBasketsLabels = {
  open: (count: number) => (count === 1 ? '1 panier borne' : `${count} paniers borne`),
  title: 'Paniers de la borne',
  empty: 'Aucun panier en attente.',
  lines: (count: number) => (count === 1 ? '1 ligne' : `${count} lignes`),
  waiting: (minutes: number) => (minutes < 1 ? 'à l’instant' : `attend depuis ${minutes} min`),
  take: 'Prendre',
  taken: (basket: string, name: string) =>
    `Panier ${basket} de ${name} repris : vérifiez-le avec le client.`,
  saveFirst: 'Enregistrez d’abord le devis à l’écran.',
  close: 'Fermer',
};
