/** The public display's wording (T-041, RG-DSP-01 à 03); part of `labels` (`labels.display`). */
export const displayLabels = {
  register: 'Caisse',
  delivery: 'Livraison',
  /** « A15 → Caisse 2 » (RG-DSP-01); the ticket alone while stations are not paired (H29). */
  call: (ticket: string, station: string | null) => (station ? `${ticket} → ${station}` : ticket),
  empty: 'Aucun appel pour le moment',
  /** Browsers keep sound off until someone touches the page once. */
  enableSound: 'Activer le son',
  unknown: 'Écran public indisponible : clé inconnue, poste désactivé ou écran désactivé.',
  offline: 'Connexion perdue : reconnexion automatique…',
};
