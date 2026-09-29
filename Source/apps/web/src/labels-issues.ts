import type { IssueCause } from '@vente-web/shared';

const CAUSES: Record<IssueCause, string> = { MISSING: 'Manquant', DAMAGED: 'Abîmé' };

/** Delivery issues and what they leave to refund (T-061, RG-LIV-04, ⚠️ H37); `labels.issues`. */
export const issueLabels = {
  causes: CAUSES,
  /** At the counter: the warehouse user reports. */
  report: 'Signaler une anomalie',
  reportTitle: (ticket: string, name: string) => `Anomalie — ${ticket} — ${name}`,
  reportHelp:
    'Pour chaque ligne touchée, la quantité qui ne peut pas être remise et pourquoi. Le responsable décidera.',
  notHandedOver: 'Non remis',
  notHandedOverOf: (position: number) => `Quantité non remise, ligne ${position}`,
  cause: 'Cause',
  causeOf: (position: number) => `Cause, ligne ${position}`,
  ordered: (qty: string) => `sur ${qty}`,
  note: 'Commentaire (facultatif)',
  send: 'Signaler au responsable',
  sending: 'Envoi…',
  tooMany: 'Une quantité non remise dépasse la quantité commandée.',
  close: 'Fermer',
  reported: (ticket: string, name: string) =>
    `${ticket} — ${name} : anomalie signalée au responsable. Vous pouvez prendre la suivante.`,
  /** The manager's list (⚠️ H37). */
  panelTitle: 'Anomalies de livraison',
  refresh: 'Actualiser',
  none: 'Aucune anomalie en attente.',
  reportedBy: (name: string, time: string) => `Signalée par ${name} à ${time}`,
  line: (qty: string, unit: string, name: string, cause: string) =>
    `${qty} ${unit} — ${name} : ${cause.toLowerCase()}`,
  waitHelp:
    'Tant que vous ne décidez rien, la commande attend, sa marchandise réservée : faites patienter ou rappelez le client.',
  requeue: 'Remettre en file',
  deliverPartly: 'Livrer partiellement',
  deciding: 'Enregistrement…',
  requeued: (ticket: string, name: string) =>
    `${ticket} — ${name} remise en file livraison à sa place.`,
  partlyDelivered: (ticket: string, name: string) =>
    `${ticket} — ${name} livrée partiellement : le client se fait rembourser à la caisse.`,
  pendingCredit: (amount: string) => `Reste à rembourser à la caisse : ${amount}`,
  newIssue: (ticket: string, name: string) => `Anomalie de livraison : ${ticket} — ${name}.`,
  /** At the register: what a partial delivery left. */
  partialTitle: (decidedBy: string) => `Livraison partielle décidée par ${decidedBy}`,
  partialAmount: 'Reste à rembourser',
  confirmPartial: (amount: string) => `Rembourser ${amount}`,
  refundedPartly: (ticket: string, name: string, creditNote: string) =>
    `Vente ${ticket} — ${name} : reste remboursé, avoir ${creditNote}.`,
};
