import { CURRENCY, DEFAULT_APP_NAME, type Role } from '@vente-web/shared';

import { accountsLabels } from './labels-accounts.js';
import { auditLabels } from './labels-audit.js';
import { capsLabels } from './labels-caps.js';
import { codesLabels } from './labels-codes.js';
import { customersLabels } from './labels-customers.js';
import { closingLabels } from './labels-closing.js';
import { deliveryLabels } from './labels-delivery.js';
import { issueLabels } from './labels-issues.js';
import { mineLabels } from './labels-mine.js';
import { pushLabels } from './labels-push.js';
import { refundLabels } from './labels-refund.js';
import { registerLabels } from './labels-register.js';
import { requestsLabels } from './labels-requests.js';
import { stockLabels } from './labels-stock.js';
import { supervisionLabels } from './labels-supervision.js';

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
    /** The login frame's bottom band: a static instruction, never a status line (H57). */
    instruction: 'Saisissez votre identifiant et votre mot de passe.',
    formTitle: 'Identifiez-vous',
    username: 'Identifiant',
    password: 'Mot de passe',
    totp: 'Code de validation (application d’authentification)',
    /** Shown once the API asks for it: a password set by the admin is only a way in (H20). */
    newPassword: 'Votre nouveau mot de passe',
    newPasswordHint: (min: number) =>
      `${min} caractères au moins, différent de celui donné par l’admin.`,
    /** Shown once the API asks for the TOTP code: outside the shop (RG-USR-04). */
    remoteNotice:
      'Accès depuis l’extérieur du magasin : saisissez aussi le code de votre application d’authentification.',
    signIn: 'Se connecter',
    signingIn: 'Connexion…',
    /** The owner's first password, chosen with the admin's one-time code (RG-USR-10). */
    activationLink: 'J’ai un code d’activation',
    activationTitle: 'Choisir votre mot de passe',
    activationHelp:
      'Avec le code remis par l’admin : il sert une seule fois, avant son échéance. L’admin ne connaîtra pas votre mot de passe.',
    activationCode: 'Code d’activation',
    activationPasswordHint: (min: number) => `${min} caractères au moins.`,
    activate: 'Enregistrer mon mot de passe',
    activating: 'Enregistrement…',
    activated: 'Votre mot de passe est enregistré : connectez-vous avec.',
    backToLogin: 'Retour à la connexion',
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
      /** Beside the chosen customer: the latest invoiced lines on demand (H47, T-038). */
      lastPurchase: (date: string) => `Dernier achat : ${date}`,
      noPurchase: 'Aucun achat',
      purchasesTitle: (name: string) => `Derniers achats de ${name}`,
      purchaseDate: 'Date',
      purchaseItem: 'Article',
      purchaseUnit: 'Unité',
      purchaseQty: 'Quantité',
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
      /** In place of the cap, on a line or a total the owner's code covers (H42). */
      maxGranted: (amount: string) => `Code du boss : au plus ${amount}`,
      beyondGranted: (amount: string) =>
        `Au plus ${amount} : c’est ce que le code du boss accorde.`,
      /** A code on the quote that does not cover this line or the total: one code per quote. */
      noLineDiscountCoded: 'Aucune remise sur cette ligne : le code du boss ne la couvre pas.',
      beyondLineCoded: (pct: string, amount: string) =>
        `Au plus ${pct} %, soit ${amount} : le code du boss ne couvre pas cette ligne.`,
      noOrderRoomCoded:
        'Plus aucune marge de remise sur ces lignes, et le code du boss ne couvre pas le total.',
      beyondOrderCoded: (amount: string) =>
        `Au plus ${amount} : le code du boss ne couvre pas le total.`,
      /** Under the table, when lines changed after the order discount was typed. */
      orderTooHigh: (max: string) =>
        `La remise sur le total dépasse maintenant le maximum (${max}) : corrigez-la.`,
      apply: 'Appliquer',
      remove: 'Retirer la remise',
      close: 'Fermer',
    },

    /** The owner's code typed on the quote (T-034b, RG-REM-04, H42). */
    code: {
      open: 'Code du boss',
      title: 'Code du boss',
      field: 'Code de remise',
      hint: 'Le code donné par le boss, comme R7K4-29QP. Il ne sert qu’une fois : appliqué, il reste sur ce devis.',
      apply: 'Appliquer le code',
      applying: 'Vérification…',
      close: 'Fermer',
      customerFirst: 'Choisissez le client avant de saisir le code du boss.',
      attached: (code: string) => `Code ${code} appliqué : les remises du boss sont sur le devis.`,
      /** The total it does not cover lost headroom to the grants: the API brought it down (H42). */
      attachedLowered: (code: string, amount: string) =>
        `Code ${code} appliqué. La remise sur le total, qu’il ne couvre pas, passe à ${amount} : les lignes ont moins de marge.`,
      /** A discount beyond its cap: the code cannot go on a quote that cannot be saved. */
      beyondCap:
        'Une remise dépasse son plafond : ramenez-la dans le plafond, appliquez le code, puis remontez-la jusqu’à ce qu’il accorde.',
      /** A price changed since the save: the quote is saved again at the new price first. */
      priceChanged:
        'Un prix a changé depuis l’enregistrement : le devis est passé au nouveau prix. Vérifiez-le avec le client, puis appliquez le code.',
      /** In place of the button once attached: one code per quote, for good (H42). */
      tag: (code: string) => `Code du boss ${code}`,
      /** On the discount of a line the code covers, for screen readers. */
      onLine: 'accordée par le code du boss',
      /** The picker once a code is attached: the customer no longer changes (H42). */
      customerLocked: (name: string) => `Client : ${name}. Fixé par le code du boss`,
    },
  },

  /** The register: its queue, the control of the order, the payment (T-040 à T-052). */
  register: registerLabels,

  /** The register closing and the day's sessions (T-054). */
  closing: closingLabels,

  /** The delivery counters (T-060, RG-LIV-01 à 03). */
  delivery: deliveryLabels,

  /** Cancelling a paid sale (T-053, RG-ANN-02). */
  refund: refundLabels,

  /** Delivery issues and partial credit (T-061, RG-LIV-04, RG-ANN-03). */
  issues: issueLabels,
  supervision: supervisionLabels,
  stock: stockLabels,
  caps: capsLabels,
  accounts: accountsLabels,
  audit: auditLabels,
  customers: customersLabels,
  codes: codesLabels,
  requests: requestsLabels,
  push: pushLabels,
  /** The salesperson's quotes and orders (T-035b). */
  mine: mineLabels,

  /** The manager's notices, in the bottom band. */
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
