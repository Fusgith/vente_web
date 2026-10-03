import type { DiscountRequestStatus } from '@vente-web/shared';

type Closed = Exclude<DiscountRequestStatus, 'PENDING'>;

/**
 * Exceptional discount requests to the owner (T-033b à d, RG-REM-03/05, H51 à H54):
 * `labels.requests`.
 */
export const requestsLabels = {
  /** Asking, on the tablet or at the register (H51). */
  ask: 'Demander au boss',
  title: 'Demander une remise au boss',
  help: 'Au-delà des plafonds : la remise voulue sur des articles et/ou sur le total. Laissez vide ce qui n’est pas demandé.',
  item: 'Article',
  wanted: 'Remise demandée',
  wantedOf: (what: string) => `Remise demandée, ${what}`,
  total: 'Total de la commande',
  totalWhat: 'total',
  reason: 'Motif',
  reasonNone: 'Choisir le motif',
  note: 'Note pour le boss (facultative)',
  noteHint: (max: number) => `${max} caractères au plus.`,
  send: 'Envoyer au boss',
  sending: 'Envoi…',
  close: 'Fermer',
  nothingAsked: 'Indiquez une remise sur au moins un article ou sur le total.',
  invalid:
    'Une remise demandée n’est pas valable : un pourcentage au-dessus de 0 et jusqu’à 100, ou un montant au-dessus de 0.',
  reasonFirst: 'Choisissez le motif de la demande.',
  customerFirst: 'Choisissez le client avant de demander une remise au boss.',
  beyondCap:
    'Une remise dépasse son plafond : ramenez-la dans le plafond, puis demandez au boss ce qui dépasse.',
  sent: 'Demande envoyée au boss : sa réponse arrivera ici.',

  /** While the owner decides (H52). */
  pending: 'Remise demandée au boss',
  customerLocked: (name: string) => `Client : ${name}. Fixé par la demande au boss`,
  withdraw: 'Retirer la demande',
  withdrawing: 'Retrait…',
  withdrawn: 'Demande retirée : les remises restent dans les plafonds.',

  /** The answer, told in the band (H53, H54). */
  decided: {
    GRANTED: (code: string) => `Le boss a accordé la remise : code ${code} appliqué.`,
    REJECTED: 'Le boss a refusé la remise : les remises restent dans les plafonds.',
    WITHDRAWN: 'La demande de remise a été retirée : les remises restent dans les plafonds.',
    EXPIRED: 'La demande de remise a expiré sans réponse du boss.',
  } satisfies Record<Closed, unknown>,
  /** On an order in the queue, its ticket given (the tablet moved on to another quote). */
  decidedOrder: (ticket: string, name: string, status: Closed) =>
    `Ticket ${ticket} de ${name} : ${
      {
        GRANTED: 'remise accordée par le boss',
        REJECTED: 'remise refusée par le boss',
        WITHDRAWN: 'demande de remise retirée',
        EXPIRED: 'demande de remise expirée',
      }[status]
    }.`,

  /** In the queues, at the register and in the supervision (H52). */
  tag: 'Remise demandée',
  /** At the register, on the order held (H52, H54). */
  atRegister: 'Remise demandée au boss : le paiement attend sa réponse.',
  withdrawHint: 'Retirer la demande avec l’accord du client : il paie alors dans les plafonds.',
  setAside: 'Remettre en attente',
  setAsideDone: (ticket: string) =>
    `Ticket ${ticket} remis en attente : il garde sa place dans la file.`,

  /** The owner's screen (T-033c, RG-DSH-05, H53, H54). */
  board: {
    title: 'Demandes de remise',
    help: 'Au-delà des plafonds. Pour chaque élément : comme demandé, une autre valeur, ou rien. L’accord devient un code appliqué aussitôt à la commande.',
    readOnly: 'Les demandes au boss et ses réponses. Seul le boss décide.',
    pending: 'En attente',
    pendingEmpty: 'Aucune demande en attente.',
    recent: 'Closes aujourd’hui',
    recentEmpty: 'Aucune demande close aujourd’hui.',
    arrived: (name: string) => `Nouvelle demande de remise pour ${name}.`,
    of: (customer: string) => `Demande pour ${customer}`,
    by: (name: string, time: string) => `Demandée par ${name} à ${time}`,
    order: (number: string) => `Commande ${number}`,
    reason: 'Motif',
    note: 'Note',
    lines: 'Lignes de la commande',
    head: {
      designation: 'Désignation',
      quantity: 'Quantité',
      net: 'Montant net',
      item: 'Élément',
      asked: 'Demandé',
      answer: 'Réponse',
      time: 'Heure',
      customer: 'Client',
      items: 'Remises (accordées, sinon demandées)',
      status: 'État',
      code: 'Code',
    },
    total: 'Total',
    answers: { asked: 'Comme demandé', other: 'Autre valeur', none: 'Rien' },
    answerOf: (what: string) => `Réponse, ${what}`,
    grantOf: (what: string) => `Remise accordée, ${what}`,
    grant: 'Accorder',
    granting: 'Accord…',
    reject: 'Refuser',
    rejecting: 'Refus…',
    nothingGranted: 'Accordez au moins un élément, ou refusez la demande.',
    otherInvalid:
      'Une autre valeur n’est pas valable : un pourcentage au-dessus de 0 et jusqu’à 100, ou un montant au-dessus de 0.',
    granted: (code: string, name: string) =>
      `Remise accordée à ${name} : code ${code}, appliqué à la commande.`,
    rejected: (name: string) => `Demande de remise pour ${name} refusée.`,
    toGive: 'Code appliqué à la commande',
    status: {
      PENDING: 'En attente',
      GRANTED: 'Accordée',
      REJECTED: 'Refusée',
      WITHDRAWN: 'Retirée',
      EXPIRED: 'Expirée',
    } satisfies Record<DiscountRequestStatus, string>,
    closedBy: (name: string) => `par ${name}`,
  },
} as const;
