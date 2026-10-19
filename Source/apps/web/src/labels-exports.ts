import { EXPORT_MAX_DAYS } from '@vente-web/shared';

/** The Excel exports (T-071, RG-EXP-01 à 03); `labels.exports`, the kinds' titles in `EXPORTS`. */
export const exportsLabels = {
  title: 'Exports Excel',
  from: 'Du',
  to: 'Au',
  /** A state now, whatever the period (stock, price grid, customers). */
  now: 'état à l’instant',
  download: (title: string) => `Télécharger « ${title} »`,
  invalid: `Période invalide : la date de début précède celle de fin, ${EXPORT_MAX_DAYS} jours au plus.`,
};
