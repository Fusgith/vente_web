/** The register closing and the day's sessions (T-054, RG-CAI-03 à 05, H35); `labels.closing`. */
export const closingLabels = {
  close: 'Clôturer la caisse',
  closeTitle: (register: string) => `Clôturer ${register}`,
  loading: 'Calcul des encaissements…',
  method: 'Moyen',
  payments: 'Paiements',
  total: 'Total',
  none: 'Aucun paiement dans cette session.',
  openingFloat: 'Fond de caisse',
  /** Refunds paid back from this register, by method (RG-ANN-02, H36). */
  refunded: (method: string, count: number) =>
    `Remboursé — ${method} (${count} avoir${count > 1 ? 's' : ''})`,
  cashExpected: 'Espèces attendues dans le tiroir',
  counted: 'Espèces comptées (MGA)',
  variance: 'Écart',
  exact: 'La caisse tombe juste.',
  note: 'Commentaire',
  noteRequired: 'Commentaire obligatoire : expliquez l’écart.',
  confirm: 'Clôturer définitivement',
  closing: 'Clôture…',
  closed: (register: string, variance: string | null) =>
    variance
      ? `${register} clôturée. Écart : ${variance}.`
      : `${register} clôturée, la caisse tombe juste.`,
  report: 'Ouvrir le rapport de clôture',
  done: 'Terminer',
  /** The day's sessions, for the manager and the owner (RG-CAI-04/05). */
  daySessions: 'Caisses du jour',
  noSession: 'Aucune caisse ouverte aujourd’hui.',
  register: 'Caisse',
  cashier: 'Caissier',
  openedAt: 'Ouverture',
  state: 'État',
  taken: 'Encaissé',
  open: 'Ouverte',
  closedAt: (time: string) => `Clôturée à ${time}`,
  forgotten: 'Oubliée : ouverte un jour précédent',
  reportShort: 'Rapport',
  reportOf: (register: string) => `Rapport de clôture — ${register}`,
  refresh: 'Actualiser',
};
