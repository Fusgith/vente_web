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
| T-001b | — | Confirmer les points nouveaux H14–H28 (CDC métier §16.2) | Fait | E00 | Tranchés le 26/09/2026 (CDC métier §16.5) |
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
| T-017 | MVP | Écran de connexion web (choix du nom, PIN, mot de passe + TOTP, choix du rôle), verrouillage d'inactivité, coquille de l'appli par rôle | Terminé | E01 | RG-USR-02/03/05 ; sur l'API de T-012 ; 28 tests web ; sur `main` le 25/09 |
| T-017b | MVP | Identité visuelle « Lamba » (ADR-0005) : jetons, polices Asap et Archivo, cadre coloré par espace avec ligne d’état, pavé et feuille partagés, écrans de connexion et du devis allégés (catégories en feuille, pavé dans le volet de gauche), galerie de démonstration `/__design` en développement | Terminé | E01 | Direction C choisie par l’utilisateur le 26/09/2026 ; RG-DEV-06 précisée (CDC v0.6) |
| T-018 | MVP | Temps réel Socket.IO : connexion authentifiée par le cookie de session (origine réévaluée comme en HTTP), salles par rôle, poste et file, événements `queue.changed` et `order.status_changed` à la validation d'une commande (notification des caisses, RG-CMD-03), client web qui revalide par l'API | Terminé | E01 | CDC technique §6.1 ; détaché de T-032 ; fait le 26/09 : poignée de main, salles, `queue.changed` et `order.status_changed`, annonce en caisse ; salles `order:<id>` et `display` avec T-040/T-041 |
| T-016 | MVP | Comptes : création/modification par l'admin (jamais de suppression, RG-USR-06), désactivation et changement de rôles qui ferment les sessions, `password_change_required` après un mot de passe posé par l'admin, commande `admin:bootstrap` pour le premier admin ; **code d'activation** à usage unique (24 h) par lequel le boss choisit lui-même son mot de passe, l'admin ne le posant jamais (RG-USR-10) | À faire | E01 | RG-USR-01/02/06/10, H20 ; prérequis de T-080 (aucun compte en production sans seed) |
| T-015 | MVP | Postes : déclaration libre (tablettes, caisses, comptoirs, écran 0/1), modifiable à chaud ; appairage de l'appareil à son poste, puis **poste obligatoire** à toute connexion dans le magasin (RG-USR-09) | À faire | E01 | §13 `stations`, H11, H21 |
| T-013 | MVP | Module de permissions (annexe B) + tests | À faire | E01 | |
| T-014 | MVP | Journal d'audit (ajout seul, droits SQL) + tests | À faire | E01 | RG-AUD-01 à 03 |
| T-019 | MVP | Unités de vente et grille de prix : unité de base, facteur, création/désactivation, prix par unité, gel du facteur utilisé | À faire | E02 | RG-ART-03/04/06 |
| T-019b | MVP | Historique des prix : nouveau prix daté, jamais deux en vigueur, fiche article (tableau + courbe), export, événement `catalog.changed` | À faire | E02 | RG-ART-07, RG-EXP-01, RG-DSH-03 ; date d'effet future [V1.1] |
| T-020 | MVP | Import Excel en quatre temps : dépôt, visualisation, annulation, validation ; une ligne par article × unité ; conversion en unité de base ; prix importés → historique ; modes ENTRÉE/INVENTAIRE ; dates d'import et d'entrée ; aucune colonne de plafond (H15) | À faire | E02 | RG-IMP-01 à 08, RG-ART-05/07 |
| T-021 | MVP | Catalogue et **recherche rapide** (RG-DEV-06) : recherche serveur `pg_trgm` + `unaccent` pendant la frappe, ajout direct sur code ou code-barres exact, syntaxe `12*CODE`, favoris, scan caméra en rafale, lecteurs Bluetooth/USB ; disponibilité en unité de base et convertie | Terminé | E02 | RG-DEV-06, RG-ART, RG-STK-01 ; jamais de défilement manuel |
| T-024 | MVP | Plafonds de remise fixés par le boss : article, unité de vente, catégorie, paramètre global ; journalisés ; en lecture pour les autres rôles | Terminé | E02 | RG-REM-01, H15 ; annexe B ; ⚠️ H40 ; fait le 29/09 : écran du boss (plafond général, catégories, article et unités après recherche), journalisé avant → après ; le responsable le voit en lecture seule |
| T-022 | MVP | Réservation jusqu'à la fin de journée, expiration, balayage, libération | Terminé | E02 | RG-STK-02/03, RG-CMD-08, `day_end_time` ; **prioritaire** : constaté le 27/09, des commandes de la veille restent en file, leurs tickets se confondent avec ceux du jour ; le verrouillage du stock dans l'ordre des articles, préalable, est corrigé (28/09) ; fait le 28/09 (H31 validée) : balayage 30 s et au démarrage, avis au commercial ; réactivation → T-035 ; codes de remise (T-034) et paniers de borne (T-036) expireront avec leur tâche |
| T-023 | MVP | Ajustements motivés, alertes de seuil | Terminé | E02 | RG-STK-05 à 07 ; ⚠️ H39 ; fait le 29/09 : ajustement en unité de vente avec motif et commentaire, sortie plafonnée au disponible, alertes de seuil en direct dans l'écran du responsable ; les alertes du boss s'afficheront avec son tableau de bord |
| T-029 | MVP | Répertoire clients : nom + téléphone obligatoires, recherche, dédoublonnage, fusion | Terminé | E03 | RG-DEV-04 ; H26 ; API et choix du client sur le devis le 26/09 ; second téléphone (décision H26) le 26/09 ; écran de fusion avec l’espace du responsable |
| T-030 | MVP | Devis : client, création, lignes présentées en tableau (N°, Désignation, Quantité, Unité, PU, Remise, Montant net), remise sur le total, totaux, enregistrement, PDF | Fait | E03 | RG-DEV-01 à 06 ; tableau (a), saisie des remises (b), enregistrement API et tablette (c), PDF A4 (d) ; ⚠️ H27 |
| T-031 | MVP | Moteur de remises dans `Source/packages/shared` + tests : remise de ligne (plafond unité → article → catégorie → paramètre ; % ou montant, contrôle en % du brut) et remise sur le total (% ou montant, bornée par la marge restante, répartie sur les lignes) ; migration des colonnes `order_discount_*` et `order_discount_share` | Terminé | E03 | RG-REM-01/02/06 ; ⚠️ H23 |
| T-032 | MVP | Validation de commande : choix de l'unité de vente, conversion en unité de base, contrôle stock cumulé, prix figé (référence au prix historisé), ticket, réservation, file, notification | Terminé | E03 | RG-CMD-02/03/04, RG-ART-06, RG-TKT ; ⚠️ H28 ; API et tablette le 26/09 ; notification des caisses → T-018 |
| T-033 | MVP | Demandes de remise exceptionnelle : sur une ou plusieurs lignes et/ou le total, % ou montant pour chacune, notification du boss (app + push à distance), accord/refus ligne par ligne ; table `discount_request_items` | À faire | E03 | RG-REM-03, RG-DSH-05 ; H22 tranchée le 25/09 ; à la caisse : paiement bloqué tant qu'une demande est en attente, retrait de la remise demandée avec l'accord du client (RG-REM-05) ; état des remises dans la supervision (RG-DSP-04) |
| T-034 | MVP | Codes de remise émis par le boss : émission sans demande pour un client (articles et/ou total, % ou montant pour chacun), liste du jour, révocation, expiration ; table `discount_code_items` | Terminé | E03 | RG-REM-04/07 ; H22 tranchée le 25/09 ; ⚠️ H41 ; fait le 29/09 (API + écran du boss) ; le code qui répond à une demande vient avec T-033 |
| T-034b | MVP | Codes de remise : saisie sur un devis (commercial), application des remises accordées au-delà des plafonds, usage unique (UTILISÉ) | En cours | E03 | RG-REM-04/05 ; ⚠️ H41, H42 ; API faite le 29/09 ; reste le champ de saisie sur la tablette |
| T-034c | MVP | Codes de remise : saisie à la caisse avant paiement (RG-CMD-05b), mention du code sur la facture | À faire | E03 | RG-REM-04/07 ; ⚠️ H42 ; après T-034b |
| T-035 | MVP | Devis et commandes du commercial sur la tablette : liste de ses devis enregistrés à reprendre, commandes renvoyées par la caisse pour un ajout ou un changement de remise (la commande garde son ticket), annulation de ses commandes avec motif, **réactivation d'une commande expirée** (RG-CMD-08, H31) | À faire | E03 | RG-DEV-02/03, RG-CMD-05b, RG-ANN-01 ; détachée de T-050 le 27/09 |
| T-036 | MVP | Borne libre-service : poste de type borne (clé comme l'écran public), catalogue restreint, panier → devis d'origine borne avec numéro de panier, liste des paniers en attente sur les tablettes, reprise par un commercial, remise à zéro après inactivité, limite d'envoi | À faire | E03 | §5.10, RG-BOR-01 à 06 ; ⚠️ H24 ; après T-030/T-032 |
| T-029b | MVP ? | Client divers : client système sans téléphone, nom de passage facultatif sur le devis | À trancher | E03 | ⚠️ H43 ; remarque du boss du 29/09 ; lot à confirmer |
| T-029c | V1.1 ? | Conditions du client et vente à crédit : plafond et durée de crédit, encours, échéances, règlements, relances, blocage | À trancher | E09 | ⚠️ H44 ; remarque du boss du 29/09 ; gros morceau (la vente à crédit n'existe pas) |
| T-022b | MVP ? | Durée de réservation : paramètre général (admin ou boss) et condition particulière par client ; nouveau ticket le jour du retour | À trancher | E02 | ⚠️ H45 ; remarque du boss du 29/09 ; modifie T-022 (fin de journée) |
| T-037 | MVP ? | Articles à promouvoir : marqués par la direction avec dates et argument, rangée « À proposer » et repère sur la tablette | À trancher | E03 | ⚠️ H46 ; remarque du boss du 29/09 |
| T-038 | MVP ? | Historique des achats du client sur la tablette : date du dernier achat, derniers articles achetés | À trancher | E03 | ⚠️ H47 ; remarque du boss du 29/09 |
| T-017c | MVP ? | Connexion sans la liste des utilisateurs : identifiant saisi, puis PIN ou mot de passe | À trancher | E01 | ⚠️ H48 ; remarque du boss du 29/09 ; modifie T-017 |
| T-040 | MVP | Files caisse/livraison : rang, appel, absence, réordonnancement | Terminé | E04 | RG-FIL ; H29 (validée le 27/09) ; API des deux files et écran de caisse le 26/09 ; appel et absence au comptoir avec T-060 ; glisser-déposer du responsable le 29/09 (T-042) ; « retirer » = annulation (T-050), « réaffecter » avec T-060 |
| T-041 | MVP | Écran public optionnel (clé de poste, temps réel, son) et mode appel verbal | À faire | E04 | RG-DSP-01 à 03, RG-DSP-05 |
| T-042 | MVP | Vue de supervision responsable | Terminé | E04 | RG-DSP-04, RG-FIL-02 ; ⚠️ H38 (indicateurs du jour) ; fait le 29/09 : indicateurs du jour, deux files en direct, glisser-déposer, priorité, annulation en file caisse, remise en file d'une commande au comptoir ; état des remises avec T-033 ; motif facultatif des déplacements non saisi à l'écran |
| T-050 | MVP | Caisse : contrôle, modifications limitées (baisser, supprimer), annulation avant paiement | Terminé | E05 | RG-CMD-05b, RG-ANN-01 ; ⚠️ H30 ; API et écran le 27/09 ; saisie du code → T-034, blocage sans code → T-033, renvoi au commercial → T-035 |
| T-051 | MVP | Paiement multi-moyens, rendu, références, idempotence | Terminé | E05 | RG-PAY ; H32 (validée le 28/09) ; fait le 28/09 avec l'**ouverture** de la session de caisse (choix de la caisse, fond de caisse) ; facture et arrondi espèces → T-052, blocage sans code → T-033, clôture → T-054 |
| T-052 | MVP | Numérotation sans trou + facture PDF stockée + test de concurrence | Terminé | E05 | RG-FAC-01 à 04 ; H33 (validée le 28/09) ; fait le 28/09 : numéro dans la transaction du paiement, contenu figé, PDF stocké, réimpression ; arrondi espèces → T-056, prix HT → T-057, code de remise sur la facture → T-034 ; une commande payée en base de dev avant T-052 n'a pas de facture |
| T-053 | MVP | Avoir total/partiel, remboursement | Terminé | E05 | RG-ANN-02/03, RG-FAC-05 ; H36 (validée le 29/09) ; fait le 28/09 : annulation d'une vente payée non prise en charge, avoir total numéroté sans trou, remboursement depuis la caisse, validation par nom et PIN du responsable, PDF, effet sur la clôture ; avoir partiel → T-061 |
| T-054 | MVP | Sessions de caisse, clôture, rapport | Terminé | E05 | RG-CAI ; ouverture faite avec T-051 (H32) ; H35 (validée le 28/09) ; fait le 28/09 : clôture (théorique par moyen, compté, écart, commentaire), rapport PDF, « Caisses du jour » du responsable et du boss avec les sessions oubliées ; export Excel → T-071 ; validation par le responsable [V1.1] |
| T-056 | MVP | Arrondi espèces (`cash_rounding`) : net à payer en espèces arrondi, ligne distincte sur la facture | À faire | E05 | RG-FMT-04 ; détachée de T-052 (H33) |
| T-057 | V1.1 | TVA avec des prix hors taxes (`prices_include_vat` = non) : net à payer TTC calculé | À faire | E05 | RG-FAC-03 ; détachée de T-052 (H33) ; défaut « prix TTC » déjà pris en charge |
| T-060 | MVP | Livraison multi-comptoirs : prise en charge (verrou), prête, remise ligne par ligne, sortie de stock | Terminé | E06 | RG-USR-08, RG-LIV-01 à 03, RG-STK-04 ; H34 (validée le 28/09) ; fait le 28/09 : API et écran du comptoir ; remise en file par le responsable : bouton dans la supervision le 29/09 (T-042) ; nom du comptoir avec T-015 |
| T-061 | MVP | Anomalies de livraison et décision du responsable | Terminé | E06 | RG-LIV-04, RG-ANN-03 ; H37 (validée le 29/09) ; fait le 29/09 : signalement au comptoir (quantité non remise, cause), décision du responsable (remise en file ou livraison partielle), avoir partiel remboursé à la caisse sur le compteur sans trou, PDF, effet sur la clôture ; correction du stock → T-023 |
| T-070 | MVP | Tableau de bord boss (indicateurs, files, stock, comparaisons) | À faire | E07 | RG-DSH-01 à 04 |
| T-071 | MVP | Exports Excel | À faire | E07 | RG-EXP ; dont le rapport de clôture de caisse (RG-CAI-03, H35) |
| T-080 | MVP | Docker Compose prod, Caddy TLS DNS-01, tunnel, DNS local | À faire | E08 | CDC technique §2, §10 ; Caddy écrase `x-access-origin` et transmet `X-Forwarded-Proto`, l'hôte d'origine et `X-Forwarded-For` sur ses deux écoutes, depuis un pair de `TRUST_PROXY` (§2.2 : sinon CSRF et limitation de débit cassés) |
| T-081 | MVP | Sauvegardes chiffrées + procédure de reprise testée | À faire | E08 | §2.3 |
| T-082 | MVP | Surveillance et alertes | À faire | E08 | §10.5 |
| T-083 | MVP | Test bout-en-bout du parcours complet | À faire | E08 | §11 |
| T-084 | MVP | Formation et mise en service (jeu d'essai, journée pilote) | À faire | E08 | Hors agent |
| T-085 | MVP | Nom de l’application fixé à la construction : défaut dans `packages/shared/src/brand.json`, règles du nom partagées, commande `pnpm dist --nom "…" [--nom-court "…"]` vers `Dist/<nom-simplifié>/`, manifeste, titre, `labels.appName`, `APP_NAME` de l’API pour l’émetteur TOTP | Terminé | E08 | RG-APP-01, ADR-0006, ⚠️ H25 ; passage d’`APP_NAME` par Docker Compose avec T-080 |
