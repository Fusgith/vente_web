import type { LicenseState } from '@vente-web/shared';

/** The trial license's lock screen and login notice (T-101, ADR-0010, H82): `labels.license`. */
export const licenseLabels = {
  title: 'Activation',
  note: 'Une clé de licence par serveur : elle se demande au fournisseur de l’application.',
  /** Why the application is locked, by the server's state. */
  reasons: {
    missing: 'Cette application n’est pas encore activée sur le serveur du magasin.',
    invalid: 'La clé enregistrée sur ce serveur n’est plus valable.',
    'other-machine': 'La clé enregistrée a été faite pour un autre serveur.',
    expired: 'La période d’essai est terminée.',
    clock: 'L’horloge du serveur retarde : remettez la date et l’heure exactes sur le PC serveur.',
  } satisfies Record<Exclude<LicenseState, 'valid' | 'unchecked'>, string>,
  changeTitle: 'Nouvelle clé de licence',
  ask: 'Envoyez ce code au fournisseur : il vous renvoie une clé faite pour ce serveur.',
  machine: 'Code de ce serveur',
  key: 'Clé de licence',
  keyHint: 'Collez la clé reçue, en entier.',
  enter: 'Activer',
  entering: 'Activation…',
  back: 'Retour',
  /** Login screen, the last days of a trial (H82). */
  endsOn: (date: string, days: number) =>
    days <= 1
      ? `Version d’essai : dernier jour (${date}).`
      : `Version d’essai jusqu’au ${date} : encore ${days} jours.`,
  change: 'Saisir une nouvelle clé',
} as const;
