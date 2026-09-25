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
