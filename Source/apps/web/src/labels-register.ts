/** The register's wording (T-040 to T-052); part of `labels` (`labels.register`). */
export const registerLabels = {
  newOrder: (ticket: string, name: string) =>
    `Nouvelle commande en file caisse : ${ticket} — ${name}`,
  queueTitle: 'File caisse',
  waitingCount: (count: number) =>
    count === 0 ? 'Aucun client en attente' : count === 1 ? '1 en attente' : `${count} en attente`,
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
  /** Opening the register (RG-CAI-01, H32). */
  openTitle: 'Ouvrir la caisse',
  openHint:
    'Choisissez votre caisse et comptez le fond de caisse : chaque paiement de la journée y sera rattaché.',
  registerChoice: 'Caisse',
  registerBusy: 'déjà ouverte',
  noRegister: 'Aucune caisse active : l’admin doit en déclarer une.',
  openingFloat: 'Fond de caisse (MGA)',
  openRegister: 'Ouvrir la caisse',
  opening: 'Ouverture…',
  opened: (register: string) => `${register} ouverte.`,
  sessionOf: (register: string, time: string) => `${register} · ouverte à ${time}`,
  /** Payment (RG-PAY-01 à 04). */
  pay: 'Encaisser',
  payTitle: (ticket: string, name: string) => `Encaisser ${ticket} — ${name}`,
  amountDue: 'Net à payer',
  method: 'Moyen de paiement',
  lineAmount: 'Montant (MGA)',
  reference: 'Référence de la transaction (obligatoire)',
  addMethod: 'Ajouter un moyen de paiement',
  removeMethod: (label: string) => `Retirer ${label}`,
  cashReceived: 'Montant reçu en espèces (MGA)',
  change: 'Rendu',
  remaining: 'Reste à payer',
  overpaid: 'Trop saisi',
  payIssues: {
    TOTAL_MISMATCH: 'Les montants doivent faire exactement le net à payer.',
    CASH_SHORT: 'Le montant reçu ne couvre pas la part en espèces.',
    CASH_TWICE: 'Une seule ligne en espèces.',
    CASH_WITHOUT_LINE: 'Montant reçu sans ligne en espèces.',
  },
  confirmPay: (amount: string) => `Encaisser ${amount}`,
  paying: 'Encaissement…',
  paid: (ticket: string, name: string, invoice: string, change: string | null) =>
    `${ticket} — ${name} payé, facture ${invoice}.` + (change ? ` Rendu : ${change}.` : ''),
  /** The invoice of the last payment, to print (RG-FAC-04, T-052). */
  lastPaid: 'Dernier encaissement',
  invoiceOf: (invoice: string) => `Facture ${invoice}`,
  openInvoice: 'Ouvrir la facture',
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
  /** The owner's rules (T-090, H62): a suggested discount, applied at the customer's request. */
  byRule: 'remise prévue',
  suggestedPct: (pct: string) => `Prévue : ${pct} %`,
  applySuggested: 'Appliquer les remises prévues',
  suggestedApplied: (count: number) =>
    count > 1 ? `${count} remises prévues appliquées.` : 'Remise prévue appliquée.',
  discountMaxRule: (pct: string, amount: string) => `Remise prévue ${pct} % : au plus ${amount}`,
  /** Discounts applied at the register within the caps, at the customer's request (T-089, H61). */
  lineDiscount: (position: number) => `Remise de la ligne ${position}`,
  noDiscount: 'Aucune',
  lineGross: 'Montant brut',
  totalDiscount: 'Remise sur le total',
  discountMax: (amount: string) => `Au plus ${amount}`,
  discountMaxCap: (pct: string, amount: string) => `Plafond ${pct} % : au plus ${amount}`,
  discountMaxGranted: (amount: string) => `Accordée par le boss : au plus ${amount}`,
  discountNoRoom: 'Aucune marge de remise ici : au-delà des plafonds, demandez la remise au boss.',
  discountBeyond: (amount: string) => `Au plus ${amount} : au-delà, demandez la remise au boss.`,
  discountTotalAfter: 'Net à payer',
  applyDiscount: 'Appliquer',
  removeDiscount: 'Retirer la remise',
  discountApplied: (position: number | null) =>
    position === null
      ? 'Remise sur le total appliquée.'
      : `Remise de la ligne ${position} appliquée.`,
  discountRemoved: (position: number | null) =>
    position === null ? 'Remise sur le total retirée.' : `Remise de la ligne ${position} retirée.`,
  /** A line's discount raised left the total less headroom: the API brought it down (H23). */
  totalLowered: (amount: string) =>
    ` La remise sur le total passe à ${amount} : les lignes ont moins de marge.`,
  /** The owner's code typed before payment (T-034c, RG-CMD-05b, H42). */
  codeHint:
    'Le code donné par le boss, comme R7K4-29QP. Il ne sert qu’une fois : appliqué, il reste sur cette commande.',
  codeAttached: (code: string) =>
    `Code ${code} appliqué : les remises du boss sont sur la commande.`,
  /** The total it does not cover lost headroom to the grants: the API brought it down (H42). */
  codeAttachedLowered: (code: string, amount: string) =>
    `Code ${code} appliqué. La remise sur le total, qu’il ne couvre pas, passe à ${amount} : les lignes ont moins de marge.`,
  cancelOrder: 'Annuler la commande',
  cancelTitle: (ticket: string, name: string) => `Annuler la commande ${ticket} — ${name}`,
  cancelReason: 'Motif de l’annulation (obligatoire)',
  cancelHint: 'Le stock réservé est libéré et le ticket clos. L’annulation est journalisée.',
  keepOrder: 'Revenir',
  cancelled: (ticket: string, name: string) => `Commande ${ticket} — ${name} annulée.`,
  /** An article to add or a discount to change within the caps (RG-CMD-05b, H56). */
  sendBack: 'Renvoyer au commercial',
  sentBack: (ticket: string, name: string) =>
    `Commande ${ticket} — ${name} renvoyée au commercial : elle garde son ticket et sa place.`,
  adjusted: (position: number) => `Ligne ${position} modifiée.`,
  removed: (position: number) => `Ligne ${position} supprimée.`,
  waitingShort: 'En attente',
  moreWaiting: (count: number) => `… et ${count} autre${count > 1 ? 's' : ''}`,
  elsewhere: 'Aux autres caisses',
  servedBy: (name: string, station: string | null) =>
    station ? `${station} — ${name}` : `Caisse de ${name}`,
  called: (ticket: string, name: string) => `Ticket ${ticket} appelé : ${name}.`,
  absent: (ticket: string, name: string) => `${ticket} — ${name} absent : remis en fin de file.`,
  /** Wait since the order entered the queue (RG-FIL-05). */
  minutes: (minutes: number) =>
    minutes < 1
      ? '< 1 min'
      : minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`,
};
