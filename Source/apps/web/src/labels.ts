import { DEFAULT_APP_NAME, type Role } from '@vente-web/shared';

/** French UI labels (ADR-0004): no French string hard-coded in logic or components. */
export const labels = {
  /** Fixed at build time (RG-APP-01, ADR-0006): `pnpm dist --nom "…"`. */
  appName: import.meta.env.VITE_APP_NAME ?? DEFAULT_APP_NAME,
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
    /** The login frame's bottom band: a static instruction, never a status line. */
    instruction: 'Touchez votre nom, puis tapez votre code.',
    /** The same band in the password form. */
    passwordInstruction: 'Saisissez votre identifiant et votre mot de passe, puis votre rôle.',
    /** The empty PIN sheet, before a name is touched. */
    pinInvitation: 'Votre code PIN se tape ici, une fois votre nom choisi.',
    passwordTitle: 'Connexion par mot de passe',
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
    searchHint: 'Code, code-barres ou nom ; « 12*CODE » ajoute 12 d’un coup.',
    clearSearch: 'Effacer la recherche',
    pendingQty: (qty: string) => `Quantité : ${qty}`,
    scan: 'Scanner',
    scanTitle: 'Scan des codes-barres',
    scanHint: 'Présentez les codes-barres l’un après l’autre : chaque article reconnu est ajouté.',
    scanUnsupported:
      'Scan par caméra indisponible sur cet appareil : utilisez une douchette ou tapez le code.',
    cameraDenied:
      'Caméra inaccessible : autorisez-la dans le navigateur, ou utilisez une douchette.',
    closeScan: 'Terminer le scan',
    /** Title of the category sheet. */
    categories: 'Choisir une catégorie',
    /** The one trigger of the category sheet: « Catégorie : Toutes ». */
    categoryTrigger: 'Catégorie :',
    allCategories: 'Toutes',
    allCategoriesTile: 'Toutes les catégories',
    closeCategories: 'Fermer',
    favorites: 'Les plus vendus',
    noFavorites: 'Vos articles les plus vendus s’afficheront ici après les premières ventes.',
    searching: 'Recherche…',
    noResult: 'Aucun article ne correspond.',
    refine: 'Précisez la recherche : seuls les 8 premiers articles sont affichés.',
    unknownCode: (code: string) => `Aucun article vendable pour « ${code} ».`,
    added: (qty: string, unit: string, name: string) => `Ajouté : ${qty} ${unit} — ${name}`,
    /** Stock of an article in its base unit: « dispo 420 pièce ». */
    availableIn: (qty: string, unit: string) => `dispo ${qty} ${unit}`,
    unitWithFactor: (unit: string, factor: string, base: string) =>
      factor === '1' ? unit : `${unit} (× ${factor} ${base})`,
    /** The factor alone, after the unit label: « × 6 ». */
    factor: (factor: string) => `× ${factor}`,
    /** The factor with its base unit, under the unit label: « (× 6 pièce) ». */
    factorOf: (factor: string, base: string) => `(× ${factor} ${base})`,
    noPrice: 'Sans prix',
    unitStock: (count: string) => `dispo ${count}`,
    maxDiscount: (pct: string) => `remise max ${pct} %`,
    maxDiscountRange: (min: string, max: string) => `remise max ${min} à ${max} %`,

    customer: {
      choose: 'Choisir le client',
      /** Name of the trigger once a customer is chosen. */
      change: (name: string) => `Client : ${name}. Changer de client`,
      title: 'Client du devis',
      close: 'Fermer',
      search: 'Téléphone ou nom du client',
      searchHint: 'Tapez au moins 3 chiffres du téléphone, ou le début du nom.',
      noResult: 'Aucun client ne correspond : créez sa fiche ci-dessous.',
      refine: 'Précisez la recherche : seuls les 8 premiers clients sont affichés.',
      newCustomer: 'Nouveau client',
      name: 'Nom',
      phone: 'Téléphone',
      save: 'Enregistrer le client',
      saving: 'Enregistrement…',
      nameRequired: 'Saisissez le nom du client.',
      phoneInvalid:
        'Téléphone invalide : 10 chiffres commençant par 0 (034 12 345 67), ou +indicatif.',
      taken: (name: string) => `Ce numéro est déjà celui de ${name}.`,
      pick: (name: string) => `Choisir ${name}`,
      chosen: (name: string) => `Client : ${name}`,
    },

    draft: {
      title: 'Lignes du devis',
      unsaved: 'Brouillon non enregistré',
      empty: 'Aucune ligne : tapez un code, scannez ou touchez un article.',
      number: 'N°',
      designation: 'Désignation',
      quantity: 'Quantité',
      unit: 'Unité',
      unitPrice: 'Prix unitaire',
      amount: 'Montant',
      netAmount: 'Montant net',
      discount: 'Remise',
      subtotal: 'Sous-total',
      orderDiscount: 'Remise sur le total',
      total: 'Net à payer',
      discountTotal: 'Total des remises',
      discountVal: (v: string) => '-' + v,
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
