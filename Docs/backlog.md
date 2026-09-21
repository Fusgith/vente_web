# Backlog

Statuts : `À faire` · `En cours` · `Bloqué` · `Terminé`. Une seule tâche `En cours` par agent. Les tâches `Terminé` depuis plus d'un mois sont supprimées (git garde l'historique).

## Épopées

| ID | Épopée | Lot |
|---|---|---|
| E00 | Spécification et validation | — |
| E01 | Socle technique : monorepo, Docker, base, auth, rôles, audit | MVP |
| E02 | Articles et stock : import Excel, catalogue, réservation, mouvements, exports | MVP |
| E03 | Vente commerciale : devis, commande, remises, ticket | MVP |
| E04 | Files d'attente, écran public, supervision | MVP |
| E05 | Caisse : contrôle, validation des remises, paiement, facture, avoir, sessions | MVP |
| E06 | Livraison : préparation, appel, remise, anomalies | MVP |
| E07 | Tableau de bord boss, rapports, exports | MVP |
| E08 | Déploiement magasin : mini-PC, tunnel, DNS, TLS, sauvegardes, reprise, surveillance | MVP |
| E09 | Lot V1.1 : retours, bon de livraison, thermique, acompte, validation clôtures, notifications, fiche client | V1.1 |
| E10 | Lot V2 : réplique cloud, multi-magasins, variantes, fidélité | V2 |

## Tâches

| ID | Lot | Tâche | Statut | Épopée | Note |
|---|---|---|---|---|---|
| T-001 | — | Valider les hypothèses H1–H13 du CDC métier §16 | À faire | E00 | Réponses de l'utilisateur attendues |
| T-002 | — | Valider les hypothèses T1–T8 du CDC technique §13 | À faire | E00 | |
| T-003 | — | Accepter ou amender les ADR 0001 à 0004 | À faire | E00 | Statut « Proposé » → « Accepté » |
| T-004 | — | Faire relire les mentions légales de facture (RG-FAC-07) par le comptable | À faire | E00 | Hors agent |
| T-005 | — | Inventaire du matériel disponible (tablettes, PC, imprimantes, box, TV) | À faire | E00 | Conditionne E08 et H10/H11 |
| T-006 | — | Choisir le nom de domaine et le fournisseur DNS/tunnel | À faire | E00 | Conditionne T1 |
| T-007 | — | Premier commit du dépôt (docs seulement) et premier push vers `origin/main` | À faire | E00 | Sur accord de l'utilisateur ; distant ajouté le 21/09/2026 |
| T-008 | — | **GO pour coder** consigné dans le journal | À faire | E00 | Déclenche E01 |
| T-010 | MVP | Scaffolding monorepo, Docker Compose dev, CI lint/typecheck/test | À faire | E01 | Après T-008 |
| T-011 | MVP | Schéma Prisma initial + migrations + seed de démonstration | À faire | E01 | CDC technique §5 |
| T-012 | MVP | Auth : PIN local, mot de passe, TOTP boss/admin, sessions, verrouillage | À faire | E01 | RG-USR-03 à 06 |
| T-013 | MVP | Module de permissions (annexe B) + tests | À faire | E01 | |
| T-014 | MVP | Journal d'audit (ajout seul, droits SQL) + tests | À faire | E01 | RG-AUD-01 à 03 |
| T-020 | MVP | Import Excel : modèle, prévisualisation, modes ENTRÉE/INVENTAIRE, historisation | À faire | E02 | RG-IMP-01 à 07 |
| T-021 | MVP | Catalogue, recherche, scan code-barres, disponibilité | À faire | E02 | RG-ART, RG-STK-01 |
| T-022 | MVP | Réservation, expiration, balayage, libération | À faire | E02 | RG-STK-02/03, RG-CMD-08 |
| T-023 | MVP | Ajustements motivés, alertes de seuil | À faire | E02 | RG-STK-05 à 07 |
| T-030 | MVP | Devis : création, lignes, enregistrement, PDF | À faire | E03 | RG-DEV |
| T-031 | MVP | Moteur de remises (politiques, plafonds, répartition) dans `Source/packages/shared` + tests | À faire | E03 | RG-REM-01 à 05 |
| T-032 | MVP | Validation de commande : contrôle stock, ticket, réservation, file, notification | À faire | E03 | RG-CMD-02/03, RG-TKT |
| T-040 | MVP | Files caisse/livraison : rang, appel, absence, réordonnancement | À faire | E04 | RG-FIL |
| T-041 | MVP | Écran public (clé de poste, temps réel, son) | À faire | E04 | RG-DSP-01 à 03 |
| T-042 | MVP | Vue de supervision responsable | À faire | E04 | RG-DSP-04 |
| T-050 | MVP | Caisse : contrôle, modifications, demande/décision de remise | À faire | E05 | RG-CMD-05b, RG-REM-06 |
| T-051 | MVP | Paiement multi-moyens, rendu, références, idempotence | À faire | E05 | RG-PAY |
| T-052 | MVP | Numérotation sans trou + facture PDF stockée + test de concurrence | À faire | E05 | RG-FAC-01 à 04 |
| T-053 | MVP | Avoir total/partiel, remboursement | À faire | E05 | RG-ANN-02/03, RG-FAC-05 |
| T-054 | MVP | Sessions de caisse, clôture, rapport | À faire | E05 | RG-CAI |
| T-060 | MVP | Livraison : préparation, prête, remise ligne par ligne, sortie de stock | À faire | E06 | RG-LIV-01 à 03, RG-STK-04 |
| T-061 | MVP | Anomalies de livraison et décision du responsable | À faire | E06 | RG-LIV-04 |
| T-070 | MVP | Tableau de bord boss (indicateurs, files, stock, comparaisons) | À faire | E07 | RG-DSH-01 à 04 |
| T-071 | MVP | Exports Excel | À faire | E07 | RG-EXP |
| T-080 | MVP | Docker Compose prod, Caddy TLS DNS-01, tunnel, DNS local | À faire | E08 | CDC technique §2, §10 |
| T-081 | MVP | Sauvegardes chiffrées + procédure de reprise testée | À faire | E08 | §2.3 |
| T-082 | MVP | Surveillance et alertes | À faire | E08 | §10.5 |
| T-083 | MVP | Test bout-en-bout du parcours complet | À faire | E08 | §11 |
| T-084 | MVP | Formation et mise en service (jeu d'essai, journée pilote) | À faire | E08 | Hors agent |
