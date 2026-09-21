# ADR-0002 — Application web progressive (PWA) plutôt qu'un APK Android

Date : 21/09/2026 · Statut : **Accepté** par l'utilisateur le 21/09/2026

## Contexte
Le besoin exprimé est « une icône sur l'écran d'accueil des tablettes Android pour ouvrir l'interface sans installation lourde ». Un APK impose une chaîne de construction Android, une signature, une distribution (Play Store ou fichier) et des mises à jour manuelles sur chaque tablette.

## Décision
L'application est une PWA installable : manifeste, icône, mode plein écran (`standalone`), service worker limité à l'enveloppe applicative. Sur Android, « Ajouter à l'écran d'accueil » depuis Chrome donne l'icône et l'ouverture plein écran. Les mises à jour sont automatiques à l'ouverture. Sur les tablettes dédiées, le mode kiosque d'Android (épinglage d'écran) verrouille l'appareil sur l'application.

## Conséquences
- HTTPS obligatoire partout (y compris sur le réseau local) : voir ADR-0001 et CDC technique §2.1.
- Aucun code natif à maintenir ; une seule base de code pour tablette, PC, téléphone et écran public.
- Si un besoin natif réel apparaît (impression Bluetooth, Play Store), la PWA sera enveloppée en TWA (Trusted Web Activity) ou Capacitor sans réécriture — décision différée [V2].

## Alternatives écartées
- APK natif (Kotlin/Flutter) — deuxième base de code, sans bénéfice fonctionnel.
- WebView maison — moins bien que la TWA, même coût de distribution.
