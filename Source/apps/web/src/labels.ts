import type { Role } from '@vente-web/shared';

/** French UI labels (ADR-0004): no French string hard-coded in logic or components. */
export const labels = {
  appName: 'Vente Web',
  tagline: 'Gestion des ventes du magasin',
  loading: 'Chargement…',
  retry: 'Réessayer',

  /** Client-side failures; API errors use `ERROR_LABELS` from the shared package. */
  errors: {
    NETWORK_ERROR: 'Serveur injoignable. Vérifiez la connexion au réseau du magasin.',
    UNEXPECTED_RESPONSE: 'Réponse inattendue du serveur.',
    lockedFor: (minutes: number) =>
      `Compte verrouillé après plusieurs échecs ; réessayez dans ${minutes} min.`,
  },

  login: {
    title: 'Connexion',
    chooseUser: 'Qui êtes-vous ?',
    noPinUsers: 'Aucun compte à code PIN pour l’instant : connectez-vous par mot de passe.',
    otherUser: 'Changer d’utilisateur',
    chooseRole: 'Rôle',
    roleRequired: 'Choisissez un rôle.',
    typePin: 'Code PIN',
    pinEntered: (count: number) =>
      count === 0
        ? 'Aucun chiffre saisi'
        : `${count} chiffre${count > 1 ? 's' : ''} saisi${count > 1 ? 's' : ''}`,
    erase: 'Effacer',
    submit: 'Valider',
    passwordLink: 'Connexion par mot de passe',
    pinLink: 'Connexion par code PIN',
    username: 'Identifiant',
    password: 'Mot de passe',
    totp: 'Code de validation (application d’authentification)',
    remoteNotice:
      'Accès depuis l’extérieur du magasin : boss et administrateur seulement, avec code de validation.',
    signIn: 'Se connecter',
    signingIn: 'Connexion…',
  },

  session: {
    locked: (minutes: number) =>
      `Écran verrouillé après ${minutes} min d’inactivité : reconnectez-vous.`,
  },

  shell: {
    activeRole: 'Rôle actif',
    signOut: 'Se déconnecter',
    remote: 'À distance',
    workspaceComing: 'Cet espace arrive avec les prochaines étapes du développement.',
  },

  /** Quick search and entry of the quote screen (RG-DEV-06). */
  sales: {
    search: 'Rechercher un article',
    searchHint: 'Code, code-barres ou désignation ; « 12*SAV-001 » ajoute 12 d’un coup.',
    pendingQty: (qty: string) => `Quantité : ${qty}`,
    scan: 'Scanner',
    scanTitle: 'Scan des codes-barres',
    scanHint: 'Présentez les codes-barres l’un après l’autre : chaque article reconnu est ajouté.',
    scanUnsupported:
      'Scan par caméra indisponible sur cet appareil : utilisez une douchette ou tapez le code.',
    cameraDenied:
      'Caméra inaccessible : autorisez-la dans le navigateur, ou utilisez une douchette.',
    closeScan: 'Terminer le scan',
    categories: 'Filtrer par catégorie',
    allCategories: 'Toutes',
    favorites: 'Les plus vendus',
    noFavorites: 'Vos articles les plus vendus s’afficheront ici après les premières ventes.',
    results: 'Résultats',
    searching: 'Recherche…',
    noResult: 'Aucun article ne correspond.',
    refine: 'Précisez la recherche : seuls les 8 premiers articles sont affichés.',
    unknownCode: (code: string) => `Aucun article vendable pour « ${code} ».`,
    added: (qty: string, unit: string, name: string) => `Ajouté : ${qty} ${unit} — ${name}`,
    baseUnit: (unit: string) => `Unité de base : ${unit}`,
    available: (qty: string) => `Disponible : ${qty}`,
    unitWithFactor: (unit: string, factor: string, base: string) =>
      factor === '1' ? unit : `${unit} (× ${factor} ${base})`,
    noPrice: 'Sans prix',
    unitStock: (count: string) => `dispo ${count}`,
    maxDiscount: (pct: string) => `remise max ${pct} %`,

    draft: {
      title: 'Lignes du devis',
      unsaved: 'Brouillon : l’enregistrement du devis arrive à l’étape suivante du développement.',
      empty: 'Aucune ligne : tapez un code, scannez ou touchez un article le plus vendu.',
      number: 'N°',
      designation: 'Désignation',
      quantity: 'Quantité',
      unit: 'Unité',
      unitPrice: 'Prix unitaire',
      amount: 'Montant',
      grossTotal: 'Total brut',
      editQty: (position: number, qty: string) => `Quantité de la ligne ${position} : ${qty}`,
    },

    pad: {
      title: (position: number) => `Ligne ${position}`,
      unit: 'Unité de vente',
      quantity: 'Quantité saisie',
      erase: 'Effacer un chiffre',
      confirm: 'Valider',
      remove: 'Supprimer la ligne',
      close: 'Fermer',
      invalid: 'Quantité invalide : de 0,01 à 999 999,99.',
    },
  },

  /** One workspace per active role (annexe B). */
  workspaces: {
    sales: { title: 'Ventes', summary: 'Devis et commandes sur tablette.' },
    cashier: { title: 'Caisse', summary: 'Contrôle, paiement et facture.' },
    warehouse: { title: 'Livraison', summary: 'Préparation et remise de la marchandise.' },
    manager: { title: 'Supervision', summary: 'Import, plafonds de remise, files et ajustements.' },
    owner: { title: 'Tableau de bord', summary: 'Ventes, remises exceptionnelles et rapports.' },
    admin: { title: 'Administration', summary: 'Comptes, postes et paramètres.' },
  } satisfies Record<Role, { title: string; summary: string }>,
} as const;
