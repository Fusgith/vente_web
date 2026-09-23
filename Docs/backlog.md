# Backlog

Statuts : `À faire` · `En cours` · `Bloqué` · `Terminé`. Une seule tâche `En cours` par agent. Les tâches `Terminé` depuis plus d'un mois sont supprimées (git garde l'historique).

## Épopées

| ID | Épopée | Lot |
|---|---|---|
| E00 | Spécification et validation | — |
| E01 | Socle technique : monorepo, Docker, base, auth, rôles, audit | MVP |
| E02 | Articles et stock : import Excel, unités de vente, grille et historique des prix, catalogue, réservation, mouvements, exports | MVP |
| E03 | Vente commerciale : clients, devis, commande, remises plafonnées, demandes au boss, ticket | MVP |
| E04 | Files d'attente, écran public optionnel ou appel verbal, supervision | MVP |
| E05 | Caisse : contrôle, codes de remise, paiement, facture, avoir, sessions | MVP |
| E06 | Livraison : préparation, appel, remise, anomalies | MVP |
| E07 | Tableau de bord boss, rapports, exports | MVP |
| E08 | Déploiement magasin : mini-PC, tunnel, DNS, TLS, sauvegardes, reprise, surveillance | MVP |
| E09 | Lot V1.1 : retours, bon de livraison, thermique, acompte, validation clôtures, notifications, fiche client | V1.1 |
| E10 | Lot V2 : réplique cloud, multi-magasins, variantes, fidélité | V2 |

## Tâches

| ID | Lot | Tâche | Statut | Épopée | Note |
|---|---|---|---|---|---|
| T-001 | — | Valider les hypothèses H1–H13 du CDC métier §16 | Fait | E00 | Tranchées le 21/09/2026, CDC métier v0.2 |
| T-001b | — | Confirmer les points nouveaux H14–H17 (CDC métier §16.2) | À faire | E00 | Prix dans l'import, qui fixe les plafonds, heure de fin de journée, rattachement automatique du code |
| T-001c | — | Grille de prix par unité de vente + historique des prix (H18) | Fait | E00 | Tranché le 21/09/2026, CDC métier v0.3 (RG-ART-06/07) |
| T-002 | — | Valider les hypothèses T1–T8 du CDC technique §13 | Fait | E00 | Validées le 21/09/2026 |
| T-003 | — | Accepter ou amender les ADR 0001 à 0004 | Fait | E00 | Acceptés le 21/09/2026 |
| T-004 | — | Faire relire les mentions légales de facture (RG-FAC-07) par le comptable | À faire | E00 | Hors agent |
| T-005 | — | Inventaire du matériel disponible (tablettes, PC, imprimantes, box, TV) | À faire | E00 | Conditionne E08 et H10/H11 |
| T-006 | — | Choisir le nom de domaine et le fournisseur DNS/tunnel | À faire | E00 | Conditionne T1 |
| T-007 | — | Premier commit du dépôt (docs seulement) et premier push vers `origin/main` | Fait | E00 | Commit e8d73a1 le 21/09/2026 |
| T-008 | — | **GO pour coder** consigné dans le journal | Fait | E00 | GO donné le 21/09/2026 |
| T-010 | MVP | Scaffolding monorepo, Docker Compose dev, CI lint/typecheck/test | Terminé | E01 | Sur `main` le 23/09 |
| T-010b | MVP | Pré-commit local (Husky ou hook git manuel) — racine git ≠ `Source/` | À faire | E01 | CI = garde-fou en attendant |
| T-010c | MVP | Icônes PWA PNG 192/512 depuis le logo du magasin | À faire | E01 | Logo à déposer dans `Autres/` par l'utilisateur ; SVG provisoire en place |
| T-011 | MVP | Schéma Prisma initial + migrations + seed de démonstration | Terminé | E01 | Sur `main` le 23/09 (migration `init` + SQL manuel, seed idempotent, CI avec PostgreSQL ✅) ; suite : T-011b |
| T-011b | MVP | Reporter dans le CDC technique §5 les écarts entre le schéma réel et le modèle décrit | À faire | E01 | Documentation seulement |
| T-012 | MVP | Auth : PIN local, mot de passe, TOTP boss/admin, sessions, verrouillage | Terminé | E01 | RG-USR-03 à 06 ; 120 tests verts ; sur `main` le 23/09 ; question ouverte H20 (qui peut poser le mot de passe du `owner`) à trancher avant T-016 |
| T-016 | MVP | Comptes : création/modification par l'admin (jamais de suppression, RG-USR-06), désactivation et changement de rôles qui ferment les sessions, `password_change_required` après un mot de passe posé par l'admin, commande `admin:bootstrap` pour le premier admin | À faire | E01 | RG-USR-01/02/06, H20 ; prérequis de T-080 (aucun compte en production sans seed) |
| T-015 | MVP | Postes : déclaration libre (tablettes, caisses, comptoirs, écran 0/1), modifiable à chaud | À faire | E01 | §13 `stations`, H11 |
| T-013 | MVP | Module de permissions (annexe B) + tests | À faire | E01 | |
| T-014 | MVP | Journal d'audit (ajout seul, droits SQL) + tests | À faire | E01 | RG-AUD-01 à 03 |
| T-019 | MVP | Unités de vente et grille de prix : unité de base, facteur, création/désactivation, prix par unité, gel du facteur utilisé | À faire | E02 | RG-ART-03/04/06 |
| T-019b | MVP | Historique des prix : nouveau prix daté, jamais deux en vigueur, fiche article (tableau + courbe), export, événement `catalog.changed` | À faire | E02 | RG-ART-07, RG-EXP-01, RG-DSH-03 ; date d'effet future [V1.1] |
| T-020 | MVP | Import Excel en quatre temps : dépôt, visualisation, annulation, validation ; une ligne par article × unité ; conversion en unité de base ; prix importés → historique ; modes ENTRÉE/INVENTAIRE ; dates d'import et d'entrée | À faire | E02 | RG-IMP-01 à 08, RG-ART-05/07 |
| T-021 | MVP | Catalogue, recherche, scan code-barres (par unité), disponibilité en unité de base et convertie | À faire | E02 | RG-ART, RG-STK-01 |
| T-022 | MVP | Réservation jusqu'à la fin de journée, expiration, balayage, libération | À faire | E02 | RG-STK-02/03, RG-CMD-08, `day_end_time` |
| T-023 | MVP | Ajustements motivés, alertes de seuil | À faire | E02 | RG-STK-05 à 07 |
| T-029 | MVP | Répertoire clients : nom + téléphone obligatoires, recherche, dédoublonnage, fusion | À faire | E03 | RG-DEV-04 |
| T-030 | MVP | Devis : client, création, lignes présentées en tableau (N°, désignation, quantité, unité, PU, remise, montant net), totaux, enregistrement, PDF | À faire | E03 | RG-DEV-01 à 05 |
| T-031 | MVP | Moteur de remises **ligne par ligne** (plafond unité → article → catégorie → paramètre ; saisie en % ou montant, contrôle en % du brut de la ligne ; pas de remise globale) dans `Source/packages/shared` + tests | À faire | E03 | RG-REM-01/02/06 |
| T-032 | MVP | Validation de commande : choix de l'unité de vente, conversion en unité de base, contrôle stock cumulé, prix figé (référence au prix historisé), ticket, réservation, file, notification | À faire | E03 | RG-CMD-02/03/04, RG-ART-06, RG-TKT |
| T-033 | MVP | Demandes de remise exceptionnelle : création sur une ou plusieurs lignes (un % chacune), notification du boss (app + push à distance), accord/refus ligne par ligne | À faire | E03 | RG-REM-03, RG-DSH-05 ; ⚠️ H22 : table des lignes de demande à ajouter au schéma |
| T-034 | MVP | Codes de remise : émission (avec ou sans demande, % par ligne ou article couvert), rattachement, usage unique, expiration, révocation | À faire | E03 | RG-REM-04/05/07 ; ⚠️ H22 : lignes du code à ajouter au schéma |
| T-040 | MVP | Files caisse/livraison : rang, appel, absence, réordonnancement | À faire | E04 | RG-FIL |
| T-041 | MVP | Écran public optionnel (clé de poste, temps réel, son) et mode appel verbal | À faire | E04 | RG-DSP-01 à 03, RG-DSP-05 |
| T-042 | MVP | Vue de supervision responsable | À faire | E04 | RG-DSP-04 |
| T-050 | MVP | Caisse : contrôle, modifications limitées, saisie de code, blocage sans code | À faire | E05 | RG-CMD-05b, RG-REM-05 |
| T-051 | MVP | Paiement multi-moyens, rendu, références, idempotence | À faire | E05 | RG-PAY |
| T-052 | MVP | Numérotation sans trou + facture PDF stockée + test de concurrence | À faire | E05 | RG-FAC-01 à 04 |
| T-053 | MVP | Avoir total/partiel, remboursement | À faire | E05 | RG-ANN-02/03, RG-FAC-05 |
| T-054 | MVP | Sessions de caisse, clôture, rapport | À faire | E05 | RG-CAI |
| T-060 | MVP | Livraison multi-comptoirs : prise en charge (verrou), prête, remise ligne par ligne, sortie de stock | À faire | E06 | RG-USR-08, RG-LIV-01 à 03, RG-STK-04 |
| T-061 | MVP | Anomalies de livraison et décision du responsable | À faire | E06 | RG-LIV-04 |
| T-070 | MVP | Tableau de bord boss (indicateurs, files, stock, comparaisons) | À faire | E07 | RG-DSH-01 à 04 |
| T-071 | MVP | Exports Excel | À faire | E07 | RG-EXP |
| T-080 | MVP | Docker Compose prod, Caddy TLS DNS-01, tunnel, DNS local | À faire | E08 | CDC technique §2, §10 ; Caddy écrase `x-access-origin` et transmet `X-Forwarded-Proto`, l'hôte d'origine et `X-Forwarded-For` sur ses deux écoutes, depuis un pair de `TRUST_PROXY` (§2.2 : sinon CSRF et limitation de débit cassés) |
| T-081 | MVP | Sauvegardes chiffrées + procédure de reprise testée | À faire | E08 | §2.3 |
| T-082 | MVP | Surveillance et alertes | À faire | E08 | §10.5 |
| T-083 | MVP | Test bout-en-bout du parcours complet | À faire | E08 | §11 |
| T-084 | MVP | Formation et mise en service (jeu d'essai, journée pilote) | À faire | E08 | Hors agent |
