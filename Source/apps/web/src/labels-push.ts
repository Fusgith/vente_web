/** The owner's notifications on a device (T-033e, RG-DSH-05, H54, ⚠️ H55): `labels.push`. */
export const pushLabels = {
  title: 'Notifications sur cet appareil',
  off: 'Recevez chaque demande de remise sur cet appareil, même application fermée.',
  on: 'Activées sur cet appareil : chaque demande arrive, même application fermée. Désactivez-les avant de confier l’appareil à quelqu’un.',
  denied:
    'Les notifications sont bloquées pour cette application : autorisez-les dans les réglages du navigateur, puis rouvrez l’application.',
  /** On an iPhone or an iPad, the home-screen app's permission is in the system's settings. */
  deniedApple:
    'Les notifications sont bloquées pour cette application : autorisez-les dans Réglages, puis Notifications, puis le nom de l’application, et rouvrez-la.',
  /** Said in the band when the owner answers no to the browser's question. */
  refused: 'Notifications refusées : elles restent bloquées sur cet appareil.',
  unsupported: 'Ce navigateur ne peut pas recevoir les notifications.',
  /** iOS 16.4 and later: only an app added to the home screen and opened from there. */
  install:
    'Sur iPhone ou iPad : ajoutez l’application à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), ouvrez-la de là, puis activez les notifications.',
  enable: 'Activer les notifications',
  enabling: 'Activation…',
  test: 'Envoyer un essai',
  testing: 'Envoi…',
  disable: 'Désactiver',
  disabling: 'Désactivation…',
  enabled: 'Notifications activées sur cet appareil.',
  disabled: 'Notifications désactivées sur cet appareil.',
  testSent: 'Essai envoyé : la notification arrive dans quelques secondes.',
  /** The browser could not reach its push service (offline), or refused for its own reasons. */
  failed:
    'Le navigateur n’a pas pu joindre son service de notifications : vérifiez la connexion à Internet, puis réessayez.',
};
