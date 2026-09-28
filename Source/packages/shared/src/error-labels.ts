/**
 * User-facing messages of API errors, keyed by stable code (CDC technique §6).
 * French lives only here (ADR-0004); the code decides, never the message.
 */
export const ERROR_LABELS = {
  VALIDATION_ERROR: 'Données invalides.',
  BAD_REQUEST: 'Requête invalide.',
  NOT_FOUND: 'Ressource introuvable.',
  RATE_LIMITED: 'Trop de tentatives, réessayez dans un instant.',
  CSRF_REJECTED: 'Requête refusée : origine non vérifiée.',
  INTERNAL_ERROR: 'Erreur interne du serveur.',
  AUTH_REQUIRED: 'Connexion requise.',
  AUTH_FORBIDDEN: 'Accès refusé pour ce rôle.',
  AUTH_INVALID_CREDENTIALS: 'Identifiants incorrects.',
  AUTH_LOCKED: 'Compte verrouillé après plusieurs échecs ; réessayez plus tard.',
  AUTH_PIN_LAN_ONLY: 'Le code PIN n’est accepté que dans le magasin.',
  AUTH_ROLE_REMOTE_FORBIDDEN: 'Ce rôle n’est pas accessible à distance.',
  AUTH_LAN_ONLY: 'Cette fonction n’est disponible que dans le magasin.',
  AUTH_TOTP_REQUIRED: 'Code de validation (application d’authentification) requis.',
  AUTH_TOTP_NOT_ENROLLED: 'La double authentification n’est pas activée pour ce compte.',
  AUTH_TOTP_INVALID: 'Code de validation incorrect.',
  AUTH_TOTP_NOT_PENDING: 'Aucune activation de la double authentification en cours.',
  AUTH_REAUTH_REQUIRED: 'Reconnectez-vous avec votre mot de passe pour ce rôle.',
  AUTH_ORIGIN_MISMATCH: 'Session ouverte dans le magasin : inutilisable à distance.',
  AUTH_SESSION_EXPIRED: 'Session expirée, reconnectez-vous.',
  AUTH_SESSION_IDLE: 'Session fermée après inactivité, reconnectez-vous.',
  PIN_REQUIRES_OPERATIONAL_ROLE:
    'Un PIN ne sert qu’aux rôles de terrain (vente, caisse, magasin, responsable).',
  STATION_INVALID: 'Poste inconnu, inactif ou incompatible avec le rôle.',
  OWNER_PASSWORD_SELF_ONLY:
    'Seul le boss choisit son mot de passe : l’admin ne peut ni le poser ni le réinitialiser.',
  CUSTOMER_PHONE_TAKEN: 'Ce numéro de téléphone est déjà celui d’un client du répertoire.',
  CUSTOMER_INACTIVE: 'Cette fiche client est désactivée ou fusionnée avec une autre.',
  CUSTOMER_PHONES_SAME: 'Les deux téléphones du client sont identiques.',
  CUSTOMER_MERGE_INVALID: 'Fusion impossible : choisissez deux fiches actives différentes.',
  QUOTE_LINE_UNAVAILABLE:
    'Un article du devis n’est plus en vente dans cette unité, ou n’a pas de prix : retirez la ligne.',
  QUOTE_DISCOUNT_BEYOND_CAP:
    'Une remise dépasse son plafond : corrigez-la, ou demandez un code au boss.',
  QUOTE_CHANGED: 'Ce devis a été modifié entre-temps : rouvrez-le avant de l’enregistrer.',
  QUOTE_NOT_DRAFT: 'Ce devis est déjà devenu une commande : il ne se modifie plus.',
  ORDER_PRICE_CHANGED:
    'Un prix a changé depuis l’enregistrement du devis : vérifiez-le avec le client, puis validez.',
  STOCK_UNAVAILABLE:
    'Stock insuffisant pour valider la commande : réduisez les quantités signalées.',
  QUEUE_EMPTY: 'Aucun client en attente dans cette file.',
  ORDER_CHANGED:
    'Cette commande a été modifiée entre-temps : elle vient d’être rechargée, recommencez.',
  ORDER_NOT_ADJUSTABLE:
    'Une quantité ne peut que baisser à la caisse : un ajout passe par le commercial.',
  ORDER_LAST_LINE: 'C’est la dernière ligne : annulez la commande plutôt que de la supprimer.',
  ORDER_NOT_CANCELLABLE: 'Cette commande ne s’annule plus ici : elle est payée, livrée ou close.',
  REGISTER_BUSY:
    'Un client est déjà à votre caisse : encaissez-le ou déclarez-le absent avant d’en appeler un autre.',
  ORDER_NOT_IN_QUEUE: 'Ce ticket n’attend plus dans la file : la liste a été mise à jour.',
  ORDER_NOT_AT_REGISTER: 'Ce ticket n’est plus à votre caisse : la liste a été mise à jour.',
  REGISTER_SESSION_REQUIRED: 'Ouvrez votre caisse (fond de caisse) avant d’encaisser.',
  REGISTER_SESSION_OPEN: 'Votre caisse est déjà ouverte.',
  REGISTER_STATION_BUSY:
    'Cette caisse est déjà ouverte par une autre personne : choisissez-en une autre.',
  PAYMENT_METHOD_INVALID: 'Moyen de paiement inconnu ou désactivé : la liste a été mise à jour.',
  PAYMENT_REFERENCE_REQUIRED: 'Saisissez la référence de la transaction pour ce moyen de paiement.',
  PAYMENT_TOTAL_MISMATCH: 'Les montants saisis ne font pas exactement le net à payer.',
  PAYMENT_CASH_SHORT: 'Le montant reçu en espèces ne couvre pas la part payée en espèces.',
  PAYMENT_CASH_TWICE: 'Une seule ligne en espèces par paiement.',
  PAYMENT_CASH_WITHOUT_LINE: 'Un montant reçu en espèces demande une ligne en espèces.',
  IDEMPOTENCY_KEY_REQUIRED: 'Requête de paiement incomplète : rechargez la page.',
  COUNTER_BUSY:
    'Une commande est déjà à votre comptoir : livrez-la ou déclarez le client absent avant d’en prendre une autre.',
  ORDER_NOT_AT_COUNTER: 'Cette commande n’est plus à votre comptoir : la liste a été mise à jour.',
  DELIVERY_INCOMPLETE:
    'Cochez chaque ligne remise au client ; une ligne manquante ou abîmée se signale comme anomalie.',
  TICKET_LETTER_MISSING:
    'Aucune lettre de ticket n’est attribuée à ce commercial : l’admin doit lui en donner une.',
} as const;

export type ErrorCode = keyof typeof ERROR_LABELS;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_LABELS, value);
}

/** Wire format of every API error (CDC technique §6). */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
