# ADR-0006 — Nom de l'application fixé à la construction

Date : 26/09/2026 · Statut : **Accepté** — demande de l'utilisateur du 26/09/2026 ; modalités ⚠️ HYPOTHÈSE H25

## Contexte
L'utilisateur veut distribuer l'application sous un nom choisi **avant la distribution**, au lieu de « Vente Web » écrit en dur. Le nom apparaît dans l'onglet du navigateur, sous l'icône installée sur la tablette (manifeste PWA), dans le cadre de chaque écran (ADR-0005) et dans l'application d'authentification du boss et de l'admin (émetteur TOTP).

## Décision
- Une commande, lancée depuis `Source/`, construit une version distribuable au nom voulu :
  `pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa"`.
  - Elle vérifie le nom (1 à 40 caractères, sans `<`, `>` ni guillemets) et le nom court (12 caractères au plus, affiché sous l'icône ; à défaut, le nom s'il est assez court, sinon erreur).
  - Elle construit la PWA avec ce nom et range le résultat dans `Dist/<nom-simplifié>/` (jamais versionné) : `web/` pour les tablettes, `nom.json` pour le serveur.
- Sans cette commande (`pnpm dev`, `pnpm build`, tests), le nom par défaut vient de `Source/packages/shared/src/brand.json` : « Vente Web » ; les règles du nom (longueurs, caractères interdits, nom simplifié du dossier) sont dans `@vente-web/shared`, testées, et reprises par la commande.
- Le code ne contient jamais le nom en dur : l'interface lit `labels.appName`, le manifeste et le titre de la page lisent la même valeur à la construction.
- L'API lit le nom dans la variable d'environnement `APP_NAME` (défaut : celui de `brand.json` ; mêmes règles, refus au démarrage si le nom est invalide) pour l'émetteur TOTP ; son passage par Docker Compose se fait avec T-080.
- Ce nom n'est **pas** la raison sociale imprimée sur les factures, qui reste un paramètre de l'admin (`store.legal`, RG-FAC-07).

## Conséquences
- Changer de nom demande une nouvelle construction et un redéploiement ; les tablettes reçoivent la mise à jour à l'ouverture suivante (ADR-0002). Le nom sous une icône déjà installée peut ne changer qu'après réinstallation de l'icône.
- L'icône ne porte aucune lettre (ADR-0005) ; le logo propre au magasin reste T-010c ; les couleurs ne changent pas avec le nom.

## Alternatives écartées
- Nom modifiable par l'admin dans les paramètres — demande un manifeste et un titre générés par le serveur ; possible plus tard si le besoin apparaît, sans remettre en cause cette commande.
- Fichier de configuration modifié à la main avant la construction — sans contrôle du nom, source d'erreurs.
