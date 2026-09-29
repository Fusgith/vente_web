import type { QueueName } from '@vente-web/shared';

/** The manager's supervision (T-042, RG-DSP-04, RG-FIL-02); `labels.supervision`. */
export const supervisionLabels = {
  indicators: 'Indicateurs du jour',
  registerWait: 'Attente moyenne en caisse',
  deliveryWait: 'Attente moyenne en livraison',
  noWaitYet: 'Aucun appel encore',
  inProgress: 'Commandes en cours',
  paidUndelivered: 'Payées, non livrées',
  queues: { register: 'File caisse', delivery: 'File livraison' } satisfies Record<
    QueueName,
    string
  >,
  serving: { register: 'En caisse', delivery: 'Aux comptoirs' } satisfies Record<QueueName, string>,
  servingNone: 'Personne pour l’instant.',
  servedBy: (who: string, where: string | null) => (where ? `${who}, ${where}` : who),
  since: (time: string) => `depuis ${time}`,
  waitingNone: 'Personne n’attend.',
  handle: 'Ordre',
  actions: 'Actions',
  move: (ticket: string) => `Déplacer ${ticket}`,
  moveHelp: 'Glisser la poignée, ou flèches haut et bas au clavier.',
  moved: (ticket: string, name: string, rank: number) =>
    `${ticket} — ${name} passe au rang ${rank}.`,
  priority: 'Prioritaire',
  priorityOf: (ticket: string) => `Prioritaire ${ticket}`,
  prioritized: (ticket: string, name: string) => `${ticket} — ${name} passe en priorité.`,
  unprioritized: (ticket: string, name: string) => `${ticket} — ${name} n’est plus prioritaire.`,
  cancelOf: (ticket: string) => `Annuler ${ticket}`,
  release: 'Remettre en file',
  releaseOf: (ticket: string) => `Remettre en file ${ticket}`,
  released: (ticket: string, name: string) =>
    `${ticket} — ${name} remis en file livraison, à sa place.`,
  refresh: 'Actualiser',
} as const;
