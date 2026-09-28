import { CURRENCY, DEFAULT_APP_NAME, type Role } from '@vente-web/shared';

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
      /** Decision H26: two numbers at most, the second optional. */
      secondPhone: 'Second téléphone (facultatif)',
      save: 'Enregistrer le client',
      saving: 'Enregistrement…',
      nameRequired: 'Saisissez le nom du client.',
      phoneInvalid:
        'Téléphone invalide : 10 chiffres commençant par 0 (034 12 345 67), ou +indicatif.',
      taken: (phone: string, name: string) => `Le ${phone} est déjà celui de ${name}.`,
      secondPhoneInvalid:
        'Second téléphone invalide : 10 chiffres commençant par 0, ou +indicatif ; sinon laissez-le vide.',
      phonesSame: 'Les deux téléphones sont identiques : laissez le second vide.',
      pick: (name: string) => `Choisir ${name}`,
      chosen: (name: string) => `Client : ${name}`,
    },

    draft: {
      title: 'Lignes du devis',
      unsaved: 'Brouillon non enregistré',
      /** The status once saved, then once changed since (T-030). */
      savedAs: (number: string) => `Devis ${number}`,
      changed: 'modifié, non enregistré',
      save: 'Enregistrer le devis',
      saveChanges: 'Enregistrer les modifications',
      saving: 'Enregistrement…',
      /** Once saved and unchanged: the quote as printed (T-030, RG-DEV-05). */
      openPdf: 'Ouvrir le PDF',
      saved: (number: string) => `Devis ${number} enregistré.`,
      customerFirst: 'Choisissez le client avant d’enregistrer le devis.',
      /** The order (T-032, RG-CMD-03): the last step, next to the amount due. */
      submit: 'Valider la commande',
      submitting: 'Validation…',
      customerFirstOrder: 'Choisissez le client avant de valider la commande.',
      /** Saved just before validating, at prices changed since the lines were added (H28). */
      pricesUpdated: (total: string) =>
        `Prix mis à jour à l’enregistrement, net à payer ${total} : vérifiez-le avec le client, puis validez.`,
      submitted: (ticket: string, name: string) => `Commande validée : ticket ${ticket} — ${name}.`,
      linesConcerned: (lines: string) => `Lignes concernées : ${lines}.`,
      empty: 'Aucune ligne : tapez un code, scannez ou touchez un article.',
      number: 'N°',
      designation: 'Désignation',
      quantity: 'Quantité',
      unit: 'Unité',
      unitPrice: 'Prix unitaire',
      netAmount: 'Montant net',
      discount: 'Remise',
      /** Under the head of each amount column, whose cells show the figures alone (RG-FMT-01). */
      inCurrency: `(${CURRENCY})`,
      /** Summary under the table, in the order of RG-DEV-05. */
      grossTotal: 'Total brut',
      lineDiscounts: 'Remises sur les lignes',
      subtotal: 'Sous-total',
      orderDiscount: 'Remise sur le total',
      orderDiscountPct: (pct: string) => `Remise sur le total (${pct} %)`,
      total: 'Net à payer',
      discountTotal: 'Total des remises',
      /** A discount taken off: « −750,00 MGA ». */
      minus: (amount: string) => `−${amount}`,
      pct: (pct: string) => `${pct} %`,
      editQty: (position: number, qty: string) => `Quantité de la ligne ${position} : ${qty}`,
    },

    /** Without a public display, the salesperson hears of their ticket being called (RG-DSP-05). */
    called: (ticket: string, name: string) =>
      `Ticket ${ticket} appelé à la caisse : prévenez ${name}.`,
    /** An order unpaid at the day end (RG-CMD-08): reactivated from the salesperson's list (T-035). */
    expired: (ticket: string, name: string) =>
      `Commande ${ticket} de ${name} expirée : non payée à la fin de la journée, son stock est libéré.`,

    /** The order just validated: its ticket, big, with the customer's name (RG-CMD-05, RG-TKT-03). */
    order: {
      title: 'Commande validée',
      ticket: 'Ticket',
      tellCustomer: 'Donnez ce ticket au client : il sera appelé à la caisse.',
      number: (number: string) => `Commande ${number}`,
      newQuote: 'Nouveau devis',
      close: 'Fermer',
    },

    /** Validation refused for want of stock (RG-CMD-02): what is short, and what would fit. */
    stock: {
      title: 'Stock insuffisant',
      /** RG-CMD-02: « 3 disponibles, 5 demandés », in base unit. */
      counts: (available: string, requested: string, unit: string) =>
        `${available} disponibles, ${requested} demandés (${unit})`,
      lines: (positions: string) => `Lignes ${positions}`,
      line: (position: number) => `Ligne ${position}`,
      fit: (position: number, qty: string, unit: string) =>
        `Ramener la ligne ${position} à ${qty} ${unit}`,
      drop: (position: number) => `Retirer la ligne ${position}`,
      hint: 'Réduisez les quantités, puis validez à nouveau.',
      close: 'Fermer',
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

    /** Discount typed on a line or on the total, in % or in MGA (RG-REM-02/06). */
    discount: {
      label: 'Remise',
      kinds: 'Remise saisie',
      inPct: 'En pourcentage (%)',
      inAmount: 'En montant (MGA)',
      pctSign: '%',
      amountSign: 'MGA',
      /** Shown before anything is typed (RG-REM-02). */
      maxLine: (pct: string, amount: string) => `Au plus ${pct} %, soit ${amount}`,
      noLineDiscount: 'Aucune remise sur cette ligne sans code du boss.',
      /** In place of the maximum, when a key is refused. */
      beyondLine: (pct: string, amount: string) =>
        `Au plus ${pct} %, soit ${amount} : au-delà, il faut un code du boss.`,
      order: 'Remise sur le total',
      subtotal: 'Sous-total',
      maxOrder: (amount: string) => `Au plus ${amount}`,
      noOrderRoom:
        'Plus aucune marge de remise sur ces lignes : une remise sur le total demande un code du boss.',
      beyondOrder: (amount: string) => `Au plus ${amount} : au-delà, il faut un code du boss.`,
      /** Under the table, when lines changed after the order discount was typed. */
      orderTooHigh: (max: string) =>
        `La remise sur le total dépasse maintenant le maximum (${max}) : corrigez-la.`,
      apply: 'Appliquer',
      remove: 'Retirer la remise',
      close: 'Fermer',
    },
  },

  /** The register: its queue (T-040, RG-FIL-01 à 05); payment comes with T-051. */
  register: {
    newOrder: (ticket: string, name: string) =>
      `Nouvelle commande en file caisse : ${ticket} — ${name}`,
    queueTitle: 'File caisse',
    waitingCount: (count: number) =>
      count === 0
        ? 'Aucun client en attente'
        : count === 1
          ? '1 en attente'
          : `${count} en attente`,
    empty: 'Aucun client en attente : les commandes validées apparaissent ici.',
    rank: 'Rang',
    ticket: 'Ticket',
    customer: 'Client',
    salesUser: 'Commercial',
    amount: 'Montant',
    wait: 'Attente',
    priority: 'Prioritaire',
    absences: (count: number) => (count === 1 ? '1 absence' : `${count} absences`),
    /** Out of turn: the customer stands at the register (RG-FIL-03). */
    call: (ticket: string) => `Appeler ${ticket}`,
    callShort: 'Appeler',
    servingTitle: 'À votre caisse',
    callNext: 'Appeler le suivant',
    next: (ticket: string, name: string) => `Suivant : ${ticket} — ${name}`,
    calling: 'Appel…',
    /** The verbal call (RG-DSP-05): what to say aloud, big. */
    announce: 'Annoncez',
    orderOf: (number: string, salesUser: string) => `Commande ${number} · ${salesUser}`,
    lines: (count: number) => (count === 1 ? '1 ligne' : `${count} lignes`),
    noShow: 'Client absent',
    paymentComing: 'L’encaissement arrive avec les prochaines étapes du développement.',
    /** Control before payment (T-050, §5.6, RG-CMD-05b, RG-ANN-01). */
    orderTitle: (number: string) => `Commande ${number}`,
    loadingOrder: 'Chargement de la commande…',
    modify: 'Modifier',
    modifyLine: (position: number) => `Modifier la ligne ${position}`,
    adjustTitle: (position: number) => `Ligne ${position}`,
    currentQty: (qty: string, unit: string) => `Quantité actuelle : ${qty} ${unit}`,
    newQty: 'Nouvelle quantité',
    lowerOnly: (qty: string, unit: string) =>
      `Moins de ${qty} ${unit} : une quantité ne peut que baisser, un ajout passe par le commercial.`,
    confirmQty: 'Valider',
    removeLine: 'Supprimer la ligne',
    lastLine: 'Dernière ligne : pour tout retirer, annulez la commande.',
    close: 'Fermer',
    withinCap: 'dans le plafond',
    byCode: 'code du boss',
    cancelOrder: 'Annuler la commande',
    cancelTitle: (ticket: string) => `Annuler la commande ${ticket}`,
    cancelReason: 'Motif de l’annulation (obligatoire)',
    cancelHint: 'Le stock réservé est libéré et le ticket clos. L’annulation est journalisée.',
    keepOrder: 'Revenir',
    cancelled: (ticket: string) => `Commande ${ticket} annulée.`,
    adjusted: (position: number) => `Ligne ${position} modifiée.`,
    removed: (position: number) => `Ligne ${position} supprimée.`,
    waitingShort: 'En attente',
    moreWaiting: (count: number) => `… et ${count} autre${count > 1 ? 's' : ''}`,
    elsewhere: 'Aux autres caisses',
    servedBy: (name: string, station: string | null) =>
      station ? `${station} — ${name}` : `Caisse de ${name}`,
    called: (ticket: string, name: string) => `Ticket ${ticket} appelé : ${name}.`,
    absent: (ticket: string) => `${ticket} absent : remis en fin de file.`,
    /** Wait since the order entered the queue (RG-FIL-05). */
    minutes: (minutes: number) =>
      minutes < 1
        ? '< 1 min'
        : minutes < 60
          ? `${minutes} min`
          : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`,
  },

  /** The manager's notices, until the supervision view (T-042). */
  manager: {
    noShows: (ticket: string, name: string, count: number) =>
      `Client absent ${count} fois : ${ticket} — ${name}.`,
  },

  /** One workspace per active role (annexe B). */
  workspaces: {
    sales: { title: 'Ventes', summary: 'Devis et commandes sur tablette.' },
    cashier: { title: 'Caisse', summary: 'Contrôle, paiement et facture.' },
    warehouse: { title: 'Livraison', summary: 'Préparation et remise de la marchandise.' },
    manager: { title: 'Supervision', summary: 'Import, files, ajustements et annulations.' },
    owner: {
      title: 'Tableau de bord',
      summary: 'Ventes, plafonds et remises exceptionnelles, rapports.',
    },
    admin: { title: 'Administration', summary: 'Comptes, postes et paramètres.' },
  } satisfies Record<Role, { title: string; summary: string }>,
} as const;
