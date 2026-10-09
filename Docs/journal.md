# Journal de bord

Entrées en ordre antichronologique (la plus récente en tête). Gabarit : `03-cdc-agent-ia.md` §5.1.

## 09/10/2026 — T-091 : code promo pour un prochain achat (H63) — agent : Claude Code (Opus 5.5)

**Fait** :
- Le code émis sans demande devient un **code promo** : le boss choisit le jour jusqu'auquel il vaut (champ « Valable jusqu’au », prérempli à aujourd'hui + `promo_code_days`, 30 par défaut, seed compris) ; il expire à l'heure `day_end_time` de ce jour. Une date passée est refusée (`422 DISCOUNT_CODE_EXPIRY_PAST`).
- API : `POST /discount-codes` accepte `validUntil` (AAAA-MM-JJ, facultatif) ; `GET /discount-codes` renvoie aussi `defaultValidUntil` pour préremplir le formulaire. `shopIsoDate` et `shopTimeOn` (heure du magasin un jour donné) rejoignent `shop-time.ts`.
- Boss : panneau « Codes promo » (actifs et du jour, colonne « Valable jusqu’au » en date) ; l'encart du code émis dit jusqu'à quand le remettre au client. Le panneau ne suit plus les accords des demandes (H64 : ils ne passent plus par lui).
- Libellés : « code du boss » / « code de remise » deviennent « code promo » (tablette, caisse, journal d'audit, facture) ; à la caisse, une ligne remisée par un accord dit « accordée par le boss », par un code tapé « code promo » ; les plafonds affichent « Remise accordée : au plus … ».
- Tests : API 2 (`discount-codes.test.ts`, dont la date choisie, refusée si passée, et `promo_code_days`), web (`DiscountCodesPanel.test.tsx`) ; web + shared 398, API ciblés 22 verts.

**Reste** : T-091b (retirer la saisie du code sur la tablette, H63 : saisi à la caisse) ; T-092 à T-096 dans l'ordre ; T-090b ; T-056 ; T-010c attend le logo.

**Décisions** : aucune nouvelle (H63 codée selon sa formulation). La saisie du code sur le devis reste en place jusqu'à T-091b, tâche à part pour garder ce changement lisible.

**Questions** : H60 à H69 à valider (T-001d).

## 09/10/2026 — T-090 : règles de remise du boss, remises prévues à la caisse (H62) — agent : Claude Code (Opus 5.5)

**Fait** :
- Modèle `DiscountRule` (migration `20261009120000_add_discount_rules`) : type (quantité achetée en unité de base, catégorie de client, période de promotion), portée (tous les articles, une catégorie, un article), taux, dates facultatives (obligatoires pour une promotion), active ou désactivée. Jamais supprimée : désactivée, journalisée `discount_rule.created` / `discount_rule.updated` (avant → après).
- API : `GET /discount-rules` (boss, responsable, caissier, commercial, admin), `POST` et `PUT /discount-rules/:id` (boss seul) ; `GET /orders/:id/suggested-discounts` : la remise prévue de chaque ligne, sur la version lue (meilleure règle en vigueur ce jour, jamais un cumul).
- La remise prévue élargit la limite d'une ligne au-delà de son plafond (H61) : source `RULE` tant qu'elle ne dépasse pas la règle ; au-delà de la règle mais dans le plafond, `WITHIN_CAP` ; au-delà des deux, `422` (le boss décide). Une baisse de quantité qui fait perdre une règle ramène la remise à la nouvelle limite (sauf les lignes accordées par le boss).
- Boss : panneau « Règles de remise » (ajout, modification, désactivation, réactivation ; recherche d'article). Responsable : le même panneau en lecture seule.
- Caisse : « Prévue : 10 % » sous chaque ligne en dessous de sa règle, bouton « Appliquer les remises prévues » (les lignes accordées par le boss restent telles quelles), « Remise prévue 8 % : au plus … » dans la feuille de remise ; une lecture des remises prévues qui échoue n'en suggère aucune.
- Tests : shared 22, API 5 (`discount-rules.test.ts`), web 8 (`DiscountRulesPanel.test.tsx`, `RegisterDiscount.test.tsx`).

**Reste** : T-090b (remises prévues sur la tablette quand le commercial remise) ; T-091 à T-096 dans l'ordre ; T-056 ; T-010c attend le logo.

**Décisions** :
- Le type de client (grossiste, semi-grossiste…) viendra comme quatrième type de règle avec T-093, qui crée ce type.
- Les remises prévues sont calculées par le serveur (route dédiée), pas ajoutées à la vue de la commande : la caisse ne les lit que pour la commande qu'elle tient.

**Questions** : H60 à H69 à valider (T-001d).

## 09/10/2026 — T-089 : remises à la caisse dans les plafonds (H61) — agent : Claude Code (Opus 5.5)

**Fait** :
- API : `POST /orders/:id/discounts` (caissier qui a appelé la commande, ou responsable) ; remise sur les lignes et/ou le total, en % ou en montant, sur la version lue. Limite d'une ligne : son plafond figé à la validation, ou l'accord du boss qui la couvre ; limite du total : la marge restante. Au-delà : `422 QUOTE_DISCOUNT_BEYOND_CAP` (lignes et total en cause) ; le boss décide.
- Un total non retouché est ramené à la marge que laissent les nouvelles remises de ligne (H23) ; `null` retire une remise. Demande au boss en attente : `409 DISCOUNT_REQUEST_PENDING`. Commande jamais à 0,00 MGA (H50).
- La commande garde son numéro, sa réservation et son ticket (ni article ni quantité ne changent) ; journalisé `order.discounted` (avant → après) ; les caisses sont prévenues.
- Caisse : la cellule Remise de chaque ligne et le bouton « Remise sur le total » ouvrent une feuille : montant brut, net à payer, maximum affiché avant toute saisie (« Plafond 15 % : au plus … », « Accordée par le boss : au plus … »), touche au-delà refusée, « Retirer la remise » ; le bandeau dit quand la remise sur le total a été ramenée. Tout est bloqué pendant une demande au boss.
- Tests : API 5 (`order-discounts.test.ts`), web 4 (`RegisterDiscount.test.tsx`).

**Reste** : T-090 à T-096 dans l'ordre (les remises prévues élargiront la limite d'une ligne avec T-090) ; T-056 ; T-010c attend le logo.

**Décisions** : aucune nouvelle (H61 codée selon sa formulation).

**Questions** : H60 à H69 à valider (T-001d).

## 09/10/2026 — T-088 : accord du boss sans code visible (H64) — agent : Claude Code (Opus 5.5)

**Fait** :
- Le code d'un accord reste en base (traçabilité, RG-AUD-01) mais n'est plus montré : la vue de la commande porte `discountCode.granted` (vrai pour la réponse à une demande).
- Boss : l'accord affiche « Appliquée à la commande D-… », la colonne Code devient Commande ; les codes d'accord sortent de sa liste des codes.
- Tablette et caisse : « Le boss a accordé la remise : elle est appliquée à la commande. », puis « Remise accordée par le boss » au lieu du code.
- Facture : « Remise : Accordée par le boss » au lieu de « Code de remise : … » (`discountGranted` dans l'instantané ; les factures déjà émises gardent leur code).
- Tests : délais Vitest de l'API portés à 30 s : vider la base de test (TRUNCATE) prend environ 5 s sur le disque de Docker Desktop, 10 s ne suffisaient plus.

**Reste** : T-089 à T-096 dans l'ordre ; T-056 ; T-010c attend le logo.

**Décisions** : aucune nouvelle (H64 codée selon sa formulation).

**Questions** : H60 à H69 à valider (T-001d).

## 09/10/2026 — T-087 : remises du commercial au choix de l'admin (H60) — agent : Claude Code (Opus 5.5)

**Fait** :
- Paramètre `sales_discount_enabled` (désactivé par défaut, seed compris) : lu par tous (`GET /sales-discount`), modifié par l'admin seul (`PUT`), journalisé `sales_discount.set` (avant → après).
- API : désactivé, le commercial ne peut ni enregistrer un devis remisé (ligne ou total), ni saisir un code du boss, ni demander une remise (`403 SALES_DISCOUNT_DISABLED`) ; le responsable remise toujours, le caissier demande toujours.
- Page admin : case « Le commercial peut accorder des remises ».
- Tablette : désactivé, ni colonne Remise, ni remise sur le total, ni boutons du boss, ni plafond sur les résultats ou le pavé. Un devis remisé repris revient sans ses remises (« Devis D-… repris sans ses remises »), à enregistrer.
- Tests : API 4 (`sales-discount.test.ts` ; les autres suites activent le paramètre dans `reset()`), web 5 (panneau admin, tablette sans remise).

**Reste** : T-088 à T-096 dans l'ordre ; T-056 ; T-010c attend le logo.

**Décisions** : aucune nouvelle (H60 codée selon sa formulation).

**Questions** : H60 à H69 à valider (T-001d).

## 09/10/2026 — Commentaires du client : hypothèses H60 à H69 — agent : Claude Code (Opus 5.5)

**Fait** :
- CDC métier v0.18 : les commentaires du client sont inscrits comme hypothèses H60 à H69 (§16.2), avec les marques ⚠️ HYPOTHÈSE dans toutes les règles touchées (§1 à §15, annexes A et B).
  - H60 : le commercial ne remise plus par défaut ; paramètre `sales_discount_enabled` de l'admin.
  - H61 : le caissier (ou le responsable) applique les remises dans les plafonds, sans le boss.
  - H62 : règles de remise du boss (quantité, catégorie de client, type de client, promotion), meilleure règle par ligne, sans cumul.
  - H63 : code promo pour un prochain achat, saisi à la caisse.
  - H64 : l'accord du boss s'applique directement à la commande, sans code affiché.
  - H65 : trois unités de vente actives au plus par article ; création d'article à l'écran par le boss ou le responsable.
  - H66 : type de client (grossiste, semi-grossiste, détaillant, particulier) et prix par type ; la catégorie ne donne que des remises.
  - H67 : vente à crédit au MVP (remplace H44) ; H68 : traite et chèque post-daté.
  - H69 : un devis remis ou une commande validée qui change se refait sous un nouveau numéro.
- Glossaire : termes anglais de ces notions (`customer_type`, `discount_rule`, `credit_terms`, `receivable`, `REPLACED`…).
- Backlog : T-001d (validation), T-087 à T-096 ; T-029c remplacée par T-095 ; T-019 et T-020 annotées.
- Point 4 d) du client (réserver des articles pour un paiement ultérieur) : déjà fait (RG-STK-02, H45, T-022b).

**Reste** : coder T-087 à T-096 dans cet ordre ; T-056 ; T-010c attend le logo.

**Décisions** : aucune définitive ; chaque point est codé selon la formulation écrite de son hypothèse.

**Questions** : H60 à H69 à valider par l'utilisateur et son client (T-001d) ; H58, H59 toujours à confirmer.

## 06/10/2026 — ADR-0008 : cloud chez OVH, partagé entre les clients — agent : Claude Code (Opus 5.5)

**Fait** :
- ADR-0008 (accepté par l'utilisateur) : l'utilisateur livre ce type d'application à plusieurs clients, toujours en local d'abord, et vend un package unique ; la partie cloud tourne sur son compte OVH, partagée. Un domaine par client (DNS OVH, DNS-01 par `caddy-dns/ovh`, clé API limitée à la zone) ; relais VPS OVH partagé, tunnel WireGuard sortant, aiguillage par nom sans déchiffrement (nginx `stream`, protocole PROXY), TLS terminé au magasin ; sauvegardes `rclone crypt` vers OVH Object Storage, compartiment par client, identifiant sans droit d'effacement, copie sur disque externe ; surveillance depuis le VPS.
- CDC technique §2.1 à §2.3, §10.3, §10.5 et §13 (T1, T2 remplacées) mis à jour ; commentaire de `Source/infra/docker-compose.yml`.
- Backlog : T-080, T-081, T-082 précisées ; nouvelle T-086 (relais VPS partagé).

**Reste** : T-056 (arrondi espèces) ; T-010c attend le logo ; H58, H59 à confirmer.

**Décisions** : ADR-0008.

**Questions** : aucune nouvelle. Hors code, pour l'utilisateur : prix du package couvrant le coût OVH dans la durée (forfait annuel recommandé), clauses de réversibilité et de sous-traitance des données au contrat ; vérifier qu'OVH vend le suffixe de domaine voulu (sinon zone DNS chez OVH, domaine acheté ailleurs).

## 06/10/2026 — T-010b : pré-commit local — agent : Claude Code (Opus 5.5)

**Fait** :
- Hook `.githooks/pre-commit` (racine git) → `Source/scripts/pre-commit.mjs` : Prettier `--check` et ESLint sur les fichiers indexés sous `Source/` ; commit refusé avec la marche à suivre en français ; sauté si les dépendances manquent.
- Activation : script `prepare` (`scripts/hooks.mjs`) qui pose `core.hooksPath = .githooks` à chaque `pnpm install`, seulement dans un dépôt git dont la racine est le dossier au-dessus de `Source/` (rien dans un dossier `Dist/`).
- Vérifié : un fichier mal formaté est refusé (code 1), les fichiers propres passent ; ce commit est passé par le hook.
- CDC technique §3 (ligne Qualité) et `Source/CLAUDE.md` mis à jour.

**Reste** : rien.

**Décisions** :
- Pas de Husky ni de nouvelle dépendance : la racine git n’est pas `Source/` ; un hook versionné et `core.hooksPath` suffisent.
- Typecheck et tests restent en CI (trop lents pour chaque commit) ; le CDC disait « lint + typecheck », corrigé.

**Questions** : aucune.

## 06/10/2026 — T-022b : durée de réservation (tests et écran) — agent : Claude Code (Opus 5.5)

**Fait** :
- Tests API `test/reservation-days.test.ts` (4 tests) : droits (lecture admin/responsable/boss, écriture admin/boss), audit avant → après, valeur identique sans trace, bornes refusées (400) ; durée propre d’un client (404 inconnu, 409 inactif) ; expiration décalée d’1 ou 3 jours selon la durée générale ou propre ; ticket du jour donné une seule fois, même place, file caisse prévenue. Test `shop-time` : jours comptés depuis la fin de journée.
- Écran : panneau « Durée de réservation » sur les pages admin et boss (`owner/ReservationDaysPanel.tsx`) — durée générale, tableau des clients à durée propre (modifier, retirer), recherche d’un client pour lui en donner une ; test du panneau (2 tests).
- Libellés d’audit : « Durée de réservation fixée », « Ticket du jour donné ».
- Vérifié : lint, typecheck, tests API `reservation-days`, `expiry`, `orders` et web ; capture de l’écran du boss.

**Reste** : rien pour T-022b, sauf la réponse à H59.

**Décisions** :
- Borne 0 à 365 jours : purement technique (H45 parle d’un soir ou de quelques jours).
- Le responsable lit la durée par l’API mais n’a pas de panneau (simplicité).

**Questions** :
- ⚠️ HYPOTHÈSE H59 (CDC métier §16.2) : ticket renouvelé chaque matin, place inchangée — ou ticket donné seulement quand le client se présente ?

## 06/10/2026 — T-022b : durée de réservation (API) — agent : Claude Code (Opus 5.5)

**Fait** (API, non encore testée) :
- Paramètre `reservation_days` (durée générale, 0 par défaut) et colonne `customers.reservation_days` (durée propre d'un client, nulle : la générale) ; migration `20261006180000_add_customer_reservation_days`.
- Routes : `GET /reservation-days` (admin, responsable, boss), `PUT /reservation-days` et `PUT /customers/:id/reservation-days` (admin, boss) ; chaque changement est journalisé (`reservation_days.set`).
- À la validation, la commande expire à la fin du dernier jour de sa durée (`nextShopTime(now, fin de journée, jours)`).
- Le balayage donne un ticket du jour aux commandes gardées d'un jour sur l'autre : même lettre, numéro suivant, même place (`order.ticket_renewed`, file caisse prévenue).

**Reste** :
- Tests API (`test/reservation-days.test.ts` : droits, audit, expiration selon la durée du client, renouvellement du ticket) ; relancer `expiry` et `orders`.
- Écran : panneau « Durée de réservation » pour l'admin et le boss (durée générale, clients à durée propre), libellés d'audit.

**Décisions** :
- Borne 0 à 365 jours : purement technique (H45 parle d'un soir ou de quelques jours).
- Le responsable lit la durée par l'API mais n'a pas de panneau (simplicité).

**Questions** :
- ⚠️ HYPOTHÈSE H59 (CDC métier §16.2) : ticket renouvelé chaque matin, place inchangée — ou ticket donné seulement quand le client se présente ?

## 06/10/2026 — T-011b : CDC technique §5 aligné sur la base réelle — agent : Claude Code (Opus 5.5)

**Fait** (documentation seulement) :
- `users` : plus de `pin_hash` (H57, T-017d) ; `sessions` : `PIN` ne reste que sur les sessions ouvertes avant H57.
- Tables ajoutées : `product_promotions` (T-037) et `discount_code_items` (T-034), avec leurs contraintes.
- Colonnes ajoutées : `customers.category` (T-029b) ; `reservations.created_at` et `closed_at`.
- `order_lines.product_price_id` : nul tant que la commande est au brouillon.
- `audit_log` : pas encore partitionnée (volume du MVP faible).
- Immutabilité : des triggers protègent déjà les tables en ajout seul, quel que soit le rôle (vérifié dans les migrations) ; le retrait des droits SQL du rôle de l'API est ajouté à T-080.
- Déjà à jour, rien à changer : `discount_codes.request_id` (lien unique avec la demande) et `order_lines.position`.

**Reste** : rien pour T-011b.

**Décisions** : aucune nouvelle ; aucune dépendance ajoutée.

**Questions** : aucune nouvelle. H58 (historique : 30 lignes ou 12 mois) attend toujours votre réponse.

## 06/10/2026 — T-037 : articles à proposer — agent : Claude Code (Opus 5.5)

**Fait** :
- Nouveau panneau « Articles à proposer » chez le boss (RG-DEV-06 §6, H46, H49 b) :
  - chercher un article, choisir les dates « Du » et « Au » (par défaut aujourd'hui et +6 jours), un argument facultatif (200 caractères au plus) ;
  - « Mettre à proposer », puis la liste des articles en cours ou à venir, avec « Retirer » ;
  - ajout et retrait journalisés (RG-AUD-01), visibles dans le journal d'audit sous le sujet « Stock ».
- Sur la tablette, quand le champ de recherche est vide : rangée « À proposer » au-dessus de « Les plus vendus », tuiles en jaune avec l'argument.
- Dans les résultats de recherche, l'article porte le repère « À proposer » et son argument.
- Le prix ne change pas : l'article reste au prix de son unité (RG-ART-07).
- API :
  - `GET /promotions`, `POST /promotions`, `POST /promotions/:id/withdraw` (boss seul) ;
  - `GET /products/favorites` renvoie aussi `promoted` ; chaque article trouvé porte `promotion` s'il est à proposer ce jour.
- Migration `add_product_promotions` : table `product_promotions`.
- Vérifié : tests API (4 nouveaux) et suite complète, web et shared (5 nouveaux) ; lint, typecheck et Prettier propres. Pas encore vu au navigateur.

**Reste** :
- Voir l'écran au navigateur en boss puis en commercial.

**Décisions** :
- Un article n'a qu'une période à la fois : deux périodes qui se chevauchent sont refusées ; des périodes qui se suivent sont acceptées.
- 12 articles au plus dans la rangée, ceux qui finissent le plus tôt d'abord ; le filtre de catégorie s'applique aussi.
- Un article à venir n'apparaît sur la tablette qu'à son premier jour ; le boss le voit déjà dans sa liste.
- Un article retiré du catalogue ne peut pas être mis à proposer.
- Aucune dépendance ajoutée.

**Questions** :
- Aucune nouvelle. H58 (historique : 30 lignes ou 12 mois) attend toujours votre réponse.

## 06/10/2026 — T-029b : catégorie de client — agent : Claude Code (Opus 5.5)

**Fait** :
- Chaque client a une catégorie ; un nouveau client est « Divers » (H43, H49 a, RG-DEV-04).
- Sur la tablette, le choix du client montre la catégorie sous le nom.
- Nouveau panneau « Clients » chez le responsable :
  - chercher par nom ou téléphone, et/ou filtrer par catégorie ;
  - changer la catégorie d'un client dans sa ligne, journalisé avant → après (RG-AUD-01) ;
  - une catégorie retirée de la liste reste visible sur les clients qui la portent.
- La liste des catégories est le paramètre `customer_categories` ; par défaut « Divers », « Régulier », « Gros contrat ».
- API :
  - `GET /customers?category=` (seul ou avec `q`) ;
  - `GET /customers/categories` ;
  - `POST /customers/:id/category` (responsable seul ; catégorie hors liste refusée).
- Migration `add_customer_category` : colonne `category`, « Divers » par défaut pour les clients existants.
- Vérifié :
  - tests API (3 nouveaux) et suite complète, web et shared ; lint, typecheck et Prettier propres ;
  - navigateur : en commercial `hery`, la catégorie s'affiche dans le choix du client ; en `responsable`, filtre « Divers » puis Rasoanaivo Hanta classée « Régulier », retrouvée avec le filtre « Régulier ».

**Reste** :
- L'admin ne peut pas encore modifier la liste des catégories à l'écran : il faut l'écran des paramètres (à créer).
- Sur une base déjà remplie, le seed ne reclasse pas les clients existants : ils restent « Divers » jusqu'au classement par le responsable.

**Décisions** :
- La catégorie s'affiche au choix du client, pas sur le devis imprimé : le devis ne change pas.
- Aucune dépendance ajoutée.

**Questions** :
- Aucune nouvelle. H58 (historique : 30 lignes ou 12 mois) attend toujours votre réponse.

## 06/10/2026 — T-038 : derniers achats du client sur la tablette — agent : Claude Code (Opus 5.5)

**Fait** :
- Dès que le commercial choisit le client sur le devis, la tablette affiche « Dernier achat : 03/10/2026 » à côté de son nom (H47, RG-DEV-04).
- Un appui ouvre la feuille « Derniers achats de … » : Date, Article, Unité, Quantité, en lecture seule.
- Un client sans facture affiche « Aucun achat ». Si le serveur ne répond pas, rien ne s'affiche : c'est une aide, pas une étape.
- API : `GET /customers/:id/purchases`, mêmes lecteurs que la fiche client (commercial, caissier, responsable, boss, admin), refusé au magasinier.
- Vérifié :
  - tests API (3 nouveaux), web et shared 367 ; lint, typecheck et Prettier propres ;
  - dans le navigateur, connecté en commercial `hery` : le client Rasoanaivo Hanta montre « Dernier achat : 03/10/2026 » et ses 4 articles.

**Reste** :
- Confirmer H58 (périmètre de l'historique, ci-dessous).

**Décisions** :
- ⚠️ HYPOTHÈSE H58 (CDC métier §16.2) :
  - 30 dernières lignes facturées, la facture la plus récente d'abord ;
  - une facture annulée en entier par un avoir est exclue ; une facture remboursée en partie garde ses lignes ;
  - les achats des fiches fusionnées dans celle-ci comptent.
- Aucune dépendance ajoutée.

**Questions** :
- H58 vous convient-elle (30 lignes) ? Alternative : une période, par exemple 12 mois.

## 06/10/2026 — T-014 : lire le journal d'audit — agent : Claude Code (Opus 5.5)

**Fait** :
- Écran « Journal d'audit » pour le responsable, le boss et l'admin (annexe B), en lecture seule :
  - une journée du magasin à la fois (aujourd'hui par défaut), la plus récente opération en tête ;
  - filtres : sujet (devis et commandes, clients, remises, stock, caisses, comptes, connexions) et identifiant ;
  - colonnes Heure, Qui (nom, rôle, « à distance »), Opération, Détail (motif, puis chaque champ changé « avant → après ») ;
  - bouton « Opérations plus anciennes » : 100 lignes par page, sans trou ni doublon.
- API : `GET /audit?day=&subject=&user=&before=` ; refus 403 pour commercial, caissier et magasinier, 401 sans session, 400 pour un filtre inconnu.
- Contrat partagé `audit.ts` (requête, ligne, page).
- Ajout seul : un test prouve que la base refuse toute modification et toute suppression d'une ligne du journal (déclencheurs existants).
- Vérifié :
  - tests API 327, web et shared 365 ; lint, typecheck et Prettier propres ;
  - dans le navigateur, connecté en responsable : les connexions et déconnexions du jour s'affichent.

**Reste** :
- Droits SQL `REVOKE UPDATE, DELETE` sur `audit_log` pour l'utilisateur applicatif : avec T-080 (installation du magasin), les déclencheurs protègent déjà.
- Export CSV/PDF du journal : avec T-071.
- Page qui défile de côté sur un écran étroit (545 px) : cause, le tableau « File livraison » (antérieur à T-014) ; tâche proposée à part.

**Décisions** :
- Sujets regroupés par type d'enregistrement (ex. « Remises » = codes, demandes et plafonds) ; une opération sans nom français affiche son code tel quel.
- Les champs changés s'affichent avec leur nom technique (`status : SUBMITTED → PAID`) : lisible pour le responsable, sans maintenir une traduction de chaque champ.
- Aucune dépendance ajoutée.
- Tests web instables sous charge (`OrderRequest`, `DiscountCode`) : passent seuls et à la relance complète ; minutage, sans lien.

**Questions** : aucune.

## 06/10/2026 — T-017d : le PIN disparaît partout — agent : Claude Code (Opus 5.5)

**Fait** :
- Remboursement à la caisse : le responsable valide en tapant **son identifiant et son mot de passe** sur l'écran du caissier. Plus de liste de noms ni de PIN. Un mot de passe faux compte comme un échec de connexion (RG-USR-05) et le champ se vide.
- Écran Comptes de l'admin : le formulaire « Nouveau PIN » est retiré. L'admin pose un **mot de passe provisoire**, changé à la première connexion (H20). La colonne « Accès » ne montre plus « PIN ».
- API : routes `PUT /auth/pin`, `PUT /users/:id/pin` et `GET /auth/users` supprimées (404). La validation du responsable vérifie le mot de passe.
- Base : migration `20261006120000_drop_user_pin` (colonne `pin_hash` supprimée), appliquée à la base de dev, seed relancé.
- Contrat partagé : la validation est `{ username, password }` ; libellés d'erreur du PIN retirés.
- CDC métier : lot MVP et annexe B disent « mot de passe » au lieu de « PIN ».
- Vérifié : tests API 321, web 268, shared 94 ; lint, typecheck et Prettier propres.

**Reste** : rien sur la connexion. Prochaine tâche du backlog à choisir (T-013 permissions, T-014 audit, T-015 postes…).

**Décisions** :
- La valeur `PIN` reste dans l'énumération `auth_method` : elle décrit les sessions ouvertes avant H57 (historique, audit). Aucune nouvelle session ne la reçoit.
- Un test web (`OrderCode.test.tsx`) a échoué une fois sous charge puis est passé 4 fois de suite : instabilité de minutage, sans lien avec le PIN.

**Questions** : aucune.

## 06/10/2026 — T-017c : connexion par identifiant et mot de passe — agent : Claude Code (Opus 5.5)

**Fait** :
- Écran de connexion : un seul formulaire « Identifiez-vous » (Identifiant, Mot de passe, Se connecter), plus le lien « J'ai un code d'activation ». Plus de liste des noms, de PIN ni de choix du rôle : le compte ouvre directement son espace.
- Le code à usage unique (TOTP) n'apparaît que hors du magasin, quand l'API le demande ; le mot de passe saisi est gardé. Le nouveau mot de passe (H20) est demandé au même endroit.
- Après verrouillage pour inactivité, l'identifiant est prérempli : on retape seulement le mot de passe.
- Contrat partagé : le corps de connexion n'a plus ni `role` ni `pin` (`username`, `password`, `totp`, `newPassword`, `stationId`).
- API : le rôle d'ouverture est déduit du compte (`openingRole`) :
  - hors du magasin, le premier rôle autorisé à distance (boss, admin) ;
  - au magasin sans poste appairé, le premier rôle du compte ;
  - au magasin sur un poste appairé, le premier rôle opérationnel accepté par le poste.
  - Celui qui cumule des rôles change ensuite par le sélecteur de l'application (RG-USR-02).
- Seed : un mot de passe de démonstration pour chaque compte du magasin, ajouté aussi aux comptes déjà en base (valeurs dans `Source/apps/api/prisma/seed/data.ts`).
- Fichiers web retirés : `PinEntry`, `PinLogin`, `RoleChoice`, `UserTile` et leur test. Galerie de dev : écrans « connexion » et « verrouillage ».
- Vérifié :
  - tests web 268, API 323, shared 94 ; lint, typecheck et Prettier propres ;
  - vraie connexion de « hery » dans le navigateur : arrivée directe sur « Ventes ».

**Reste** : T-017d. Le PIN sert encore à trois endroits, à retirer :
- la validation du responsable à la caisse ;
- la liste `/auth/users` utilisée par le remboursement ;
- les routes PIN et la colonne `pinHash`.

À la place, l'admin posera un mot de passe provisoire.

**Décisions** :
- Rôle d'ouverture selon `openingRole`, comme formulé dans ⚠️ HYPOTHÈSE H57.
- Le code TOTP n'est demandé qu'une fois que l'API l'exige ; l'écran ne devine pas l'origine.

**Questions** : aucune.

## 06/10/2026 — Décision H57 : connexion par identifiant et mot de passe, sans PIN ni choix du rôle — agent : Claude Code (Opus 5.5)

**Fait** :
- Remarque de l'utilisateur sur l'écran de connexion : la liste des noms (supprimée par H48 le 29/09) était toujours là, car T-017c n'avait pas été codée ; le PIN et le choix du rôle venaient des règles d'origine RG-USR-02 et RG-USR-03.
- CDC métier : RG-USR-02 (aucun choix de rôle à la connexion, sélecteur dans l'application pour qui en cumule) et RG-USR-03 (identifiant + mot de passe partout, plus de PIN) réécrites ; décision H57 ajoutée au tableau des hypothèses.
- Backlog : T-017c réécrite (écran de connexion simple), passée « En cours » ; T-017d ajoutée (retrait du PIN partout ailleurs).

**Reste** :
- Coder T-017c : contrat partagé sans `role` dans le corps de connexion ; l'API déduit le rôle (rôle servi par le poste appairé, sinon le premier du compte) ; écran Identifiant + Mot de passe (+ code à usage unique hors du magasin seulement) ; mots de passe de démonstration pour les comptes du magasin dans le seed.
- Puis T-017d.

**Décisions** : H57 (utilisateur, 06/10/2026). Rôle d'ouverture d'un compte à plusieurs rôles : ⚠️ HYPOTHÈSE notée dans H57.

**Questions** : aucune.

**Arrêt** : plafond hebdomadaire de 60 % atteint ; reprise le jour même, plafond relevé à 80 % par l'utilisateur.

## 05/10/2026 — Correctif T-010d : l'API refusait le `.env` copié du modèle — agent : Claude Code (Opus 5.5)

**Fait** :
- Au premier double-clic sur `Lancer Vente Web.cmd`, l'API s'arrêtait (« Réponse inattendue du serveur » à l'écran) : `.env.example` livrait `VAPID_SUBJECT=mailto:` sans clés, or les trois variables VAPID vont ensemble ou pas du tout (T-033e).
- `.env.example` : `VAPID_SUBJECT` vide (push coupé par défaut), commentaire sur la façon de l'activer.
- `pnpm demarrer` répare un `.env` déjà copié de l'ancien modèle (ligne `VAPID_SUBJECT=mailto:` nue → vide).
- Test : l'API démarre avec le modèle tel que le lanceur le copie (échoue avec l'ancien modèle, passe avec le nouveau).

**Reste** : inchangé (T-010b ensuite ; T-080 selon ADR-0007).

**Décisions** : aucune. **Questions** : aucune.

## 05/10/2026 — Livraison : dossier Windows tout-en-un (ADR-0007) — agent : Claude Code (Opus 5.5)

**Fait** :
- Question de l'utilisateur : faudra-t-il installer « mille et une choses » chez le client, ou lui faire acheter un serveur ? Il veut copier des fichiers et que ça marche.
- Réponse : le code (API, PWA, règles) ne dépend pas de la façon d'installer ; seule la livraison (T-080, pas commencée) était prévue sur mini-PC Linux + Docker.
- **ADR-0007** : le serveur du magasin est un PC Windows (8 Go suffisent) ; `pnpm dist` livrera un dossier autonome (Node portable, PostgreSQL, Caddy, cloudflared, scripts Installer / Mettre à jour / Sauvegarder / Restaurer, services Windows, données hors du dossier). Docker reste pour le développement.
- CDC technique (§2, §2.3, §5, §10, T4), `CLAUDE.md` et backlog (T-080, T-081) alignés.

**Décisions** : ADR-0007, choix A de l'utilisateur. B (mini-PC Linux + Docker) et l'hébergement web par FTP écartés (ce dernier contraire à ADR-0001).

**Reste** : T-080 réécrite selon ADR-0007 ; dépendances binaires (Node, PostgreSQL, Caddy, cloudflared, outil de service Windows) à justifier ici avec T-080. Prochaine tâche : T-010b.

**Questions** : aucune.

## 05/10/2026 — T-010d : lanceur de développement en un double-clic — agent : Claude Code (Opus 5.5)

**Fait** :
- Demande de l'utilisateur : ne plus taper de commandes pour lancer l'application (l'API s'arrêtait sur `DATABASE_URL` absent, faute de `Source/.env`).
- `Lancer Vente Web.cmd` (racine du dépôt) → `pnpm demarrer` (`Source/scripts/demarrer.mjs`), qui enchaîne :
  - démarre Docker Desktop s'il est installé mais arrêté (attente jusqu'à 3 min) ;
  - crée `.env` depuis `.env.example` s'il manque (sans jamais afficher les valeurs) ;
  - installe les dépendances si `node_modules` manque ; régénère le client Prisma (il suit le schéma après un `git pull`) ;
  - démarre la base, attend `pg_isready`, applique les migrations (`db:deploy`) et le seed (il garde ce qui est déjà en base) ;
  - lance `pnpm dev` et ouvre `http://localhost:5173` dès que la PWA répond. Fermer la fenêtre arrête tout.
- `DATABASE_URL` est construite à partir des mêmes variables que `infra/docker-compose.yml` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, mêmes valeurs par défaut) : le lanceur vise toujours la base qu'il démarre, même si `.env` porte encore l'ancien port 5432 (entrée T-010).
- `.gitattributes` : `*.cmd` en fin de ligne Windows (cmd.exe).
- Aucune dépendance ajoutée (Node seul : `child_process`, `fs`, `fetch`, `process.loadEnvFile`).
- Vérifié : lint et format verts ; sonde `pg_isready`, `db:deploy` et `db:seed` passent sur la base de dev avec l'URL construite. Le script complet n'a pas été lancé par l'agent : la création de `.env` revient à l'utilisateur (règle des fichiers `.env*`).

**Décisions** : à la demande de l'utilisateur, les règles `deny Read(**/.env)` et `deny Read(**/.env.*)` sont retirées de `.claude/settings.json` (phase de test : aucun vrai mot de passe). Le mode auto de Claude Code refuse encore à l'agent de créer `.env` (« Self-Modification ») : seul l'utilisateur peut lever ce refus.

**Reste** : premier lancement par l'utilisateur (double-clic). Choix de la livraison chez le client (A : dossier Windows tout-en-un, nouvel ADR ; B : mini-PC Linux + Docker, CDC §10.2) avant T-080. Puis T-010b, prochaine tâche du backlog.

**Questions** : aucune.

## 05/10/2026 — Tests du boss instables sous charge — agent : Claude Code (Opus 5.5)

**Fait** :
- Cause : le focus (et la liste des commandes suivies du panneau des demandes) est posé par un `useEffect`. React l'exécute dans la même tranche que l'affichage, sauf quand il épuise sa tranche de 5 ms (machine chargée) : l'effet passe alors à la tranche suivante, après le `findBy…`/`waitFor` du test et son `setTimeout(0)`, et la vérification synchrone qui suit échoue.
- Reproduit à coup sûr en simulant la charge (horloge de React qui saute, tranche suivante retardée de 20 ms ; configuration temporaire, non commitée) : 6 échecs dans `DiscountRequestsPanel.test.tsx` et `PushSwitch.test.tsx`.
- Tests : les 5 vérifications de focus attendent le focus (`waitFor`), comme le correctif de `DiscountRequest.test.tsx` ; ce qu'elles vérifient ne change pas.
- `DiscountRequestsPanel` : les commandes des cartes sont relevées dans un `useLayoutEffect` (pendant l'affichage) au lieu d'un `useEffect`. Un événement temps réel reçu juste après la lecture de la liste, sur une tablette chargée, trouve ces commandes : avant, il pouvait être ignoré (même cause, test « reads again when the order of a card changes »).
- Sous charge simulée : 21/21 trois fois ; suite web complète 274/274 cinq fois ; lint, format et typecheck verts.

**Décisions** : aucune nouvelle.

**Reste** : la même charge simulée fait échouer 8 autres tests web, presque tous de la même famille (focus ou bandeau vérifiés juste après une mise à jour asynchrone) : `OrderCode`, `OrderRequest` (2), `DiscountCode`, `realtime`, `DeliveryWorkspace`, `DiscountCapsPanel` ; `push-device` (délai dépassé) est peut-être un artefact de la simulation. À stabiliser de la même façon.

**Questions** : aucune.

## 05/10/2026 — T-016g : le boss choisit son mot de passe avec le code — agent : Claude Code (Opus 5.5)

**Fait** :
- Connexion par mot de passe (au magasin comme à distance) : lien « J’ai un code d’activation » → formulaire « Choisir votre mot de passe » (`auth/OwnerActivation.tsx`) : identifiant, code d'activation, nouveau mot de passe (10 caractères au moins) → `POST /auth/activate` (RG-USR-10). Aucune session ne s'ouvre : retour à la connexion avec « Votre mot de passe est enregistré : connectez-vous avec. », l'identifiant gardé et le rôle « Boss » coché.
- Code refusé : message de l'API, le code s'efface (un code faux compte comme un essai).
- `authApi.activate` ; libellés `labels.login.activation*`.
- 1 test web ; lint, format, typecheck verts ; suite web complète 274/274.
- **T-016 (comptes) terminée** : API (a à c), connexion (d), écran de l'admin (e, f), activation du boss (g).

**Décisions** : aucune nouvelle.

**Reste** : prochaine tâche du backlog (T-010b pré-commit local, ou la suivante en MVP) ; surveiller les tests du boss (`DiscountRequestsPanel`, `PushSwitch`) qui ont échoué une fois sous charge.

**Questions** : aucune.

## 05/10/2026 — T-016f : accès d'un compte dans l'écran de l'admin — agent : Claude Code (Opus 5.5)

**Fait** :
- Sous le formulaire d'un compte, bloc « Accès de … » (`admin/AccountSecrets.tsx`) : nouveau PIN (rôles opérationnels, 4 à 6 chiffres), nouveau mot de passe (tout compte sauf le boss ; la personne le remplace à sa prochaine connexion, H20), « Déverrouiller » si le compte est verrouillé (RG-USR-05), « Effacer le TOTP » s'il en a un, « Fermer ses sessions ». L'admin ne voit jamais un secret ; la liste se met à jour (accès, état) sans fermer le formulaire.
- Boss : pas de champ mot de passe ; « Créer un code d'activation » affiche le code à remettre et son échéance (heure du magasin, RG-USR-10).
- `usersApi` : `setPin`, `setPassword`, `activationCode`, `unlock`, `resetTotp`, `closeSessions`.
- 2 tests web ; lint, format, typecheck verts. Suite web complète : 271/273 ; deux tests existants du boss (`DiscountRequestsPanel` « grants the soap… », `PushSwitch` « turns them on… ») échouent sous charge puis réussissent seuls (21/21) — instabilité préexistante, hors T-016f.

**Décisions** : aucune nouvelle.

**Reste** : T-016g (écran du boss pour choisir son mot de passe avec le code) ; stabiliser les tests du boss qui échouent sous charge.

**Questions** : aucune.

## 05/10/2026 — T-016e : écran des comptes de l'admin — agent : Claude Code (Opus 5.5)

**Fait** :
- Espace « Administration » : panneau « Comptes » (`admin/AccountsPanel.tsx`) — liste avec identifiant, nom, rôles, lettre de ticket, état (actif, désactivé, verrouillé) et accès existants (PIN, mot de passe, « mot de passe à changer », TOTP), jamais un secret.
- Formulaire (`admin/AccountForm.tsx`) : nouveau compte (identifiant, nom, rôles, lettre de ticket demandée pour un commercial seulement) et modification ; seuls les champs changés partent (`PATCH /users/{id}`) ; case « Compte actif » avec l'avertissement que rôles et désactivation ferment les sessions ; refus de l'API affichés (ex. `LAST_ADMIN`). Client `api/users.ts` ; libellés `labels-accounts.ts`.
- 3 tests web ; lint, format, typecheck verts. CI du correctif du test instable (`176af1a`) verte. Un test existant (`DiscountRequestsPanel`, « refuses in one gesture ») a échoué une fois sous charge en local puis réussi seul : à surveiller.

**Décisions** : T-016 redécoupée — T-016f (secrets et code d'activation dans l'écran de l'admin), T-016g (écran d'activation du boss).

**Reste** : T-016f, T-016g.

**Questions** : aucune.

## 05/10/2026 — T-016d : nouveau mot de passe à la connexion — agent : Claude Code (Opus 5.5)

**Fait** :
- Formulaire de connexion par mot de passe : quand l'API répond `AUTH_PASSWORD_CHANGE_REQUIRED`, le champ « Votre nouveau mot de passe » apparaît (focus, aide : 10 caractères au moins, différent de celui donné par l'admin) ; le mot de passe actuel et le code TOTP sont gardés, la nouvelle tentative envoie `newPassword`. Sur `AUTH_PASSWORD_UNCHANGED`, seul le nouveau mot de passe est à ressaisir.
- Test web (`App.test.tsx`) ; lint, format, typecheck verts.

**Décisions** : T-016d réduite au champ de connexion ; l'écran de l'admin et l'écran d'activation du boss passent en T-016e.

**Reste** : T-016e (écran de l'admin, écran du boss pour le code d'activation).

**Questions** : aucune.

## 05/10/2026 — T-016c : mot de passe à changer et premier admin — agent : Claude Code (Opus 5.5)

**Fait** :
- Colonne `users.password_change_required` (migration `20261005130000_add_password_change_required`) : posée quand l'admin fixe un mot de passe (`PUT /users/{id}/password`), levée quand l'utilisateur choisit le sien (`PUT /auth/password`, activation du boss). Exposée dans la liste des comptes (`passwordChangeRequired`).
- Connexion par mot de passe : tant que ce mot de passe n'est pas remplacé, `POST /auth/login` répond `AUTH_PASSWORD_CHANGE_REQUIRED` (403) une fois l'identité prouvée (mot de passe juste, et TOTP hors du magasin) ; l'échec n'est pas compté et le code TOTP n'est pas consommé. Avec `newPassword` (différent de l'actuel, sinon `AUTH_PASSWORD_UNCHANGED`), le mot de passe est remplacé dans la même instruction que la remise à zéro du verrouillage, journalisé `user.password_set` motif `change_required`, puis la session s'ouvre. La connexion par PIN n'est pas concernée.
- Commande `admin:bootstrap --identifiant … --nom …` (`src/cli/admin-bootstrap.ts`, service `bootstrapAdmin`) : crée le premier admin tant qu'aucun admin actif n'existe, mot de passe provisoire de 16 caractères (alphabet sans ambiguïté des codes) affiché une seule fois, à changer à la première connexion ; journalisé `user.created` motif `bootstrap` sans auteur. Sinon ne fait rien ; refuse un identifiant déjà pris. Aucune dépendance ajoutée (`node:util` `parseArgs`).
- CDC technique §5, §6 et exploitation à jour ; 5 tests d'API (`password-change-required.test.ts`), test des comptes adapté ; test web instable de la demande de remise rendu robuste (attente du focus) ; lint, format et typecheck verts ; tests avec base sur la CI.

**Décisions** :
- Le changement imposé se fait dans la requête de connexion (`newPassword`) plutôt que par une session restreinte : aucune session ne s'ouvre avec un mot de passe que l'admin connaît.
- `admin:bootstrap` ne crée un admin que s'il n'en reste aucun actif : c'est aussi la voie de secours si tous les admins sont désactivés, jamais un moyen de contourner l'admin en place.

**Reste** : T-016d (écran de l'admin, écran du boss pour le code d'activation, champ « nouveau mot de passe » à la connexion).

**Questions** : aucune.

## 05/10/2026 — T-016b : code d'activation du boss, côté API — agent : Claude Code (Opus 5.5)

**Fait** :
- `POST /users/{id}/activation-code` (admin, compte boss seulement) : code de 12 caractères en groupes de 4 (même alphabet sans ambiguïté que les codes de remise), valable 24 h, montré une seule fois ; seule son empreinte argon2id est gardée (colonnes `activation_code_hash`, `activation_expires_at`, migration `20261005120000_add_owner_activation_code`). Un nouveau code remplace le précédent. Journalisé `user.activation_issued` (échéance seule).
- `POST /auth/activate` (public, limité comme la connexion) : le boss donne son identifiant, le code et le mot de passe qu'il choisit (RG-USR-10). Code faux ou expiré : une seule réponse `ACTIVATION_INVALID`, comptée comme un échec de connexion (verrouillage RG-USR-05). Code juste : consommé une seule fois, mot de passe posé, verrouillage levé, toutes les sessions du compte fermées ; journalisé `user.activation_used` puis `user.sessions_revoked`. Le boss se connecte ensuite normalement.
- Codes d'erreur `ACTIVATION_OWNER_ONLY`, `ACTIVATION_INVALID` ; CDC technique §5 et §6 à jour.
- 6 tests d'API (`owner-activation.test.ts`) ; lint, format et typecheck verts ; tests avec base sur la CI.

**Décisions** :
- L'activation n'ouvre pas de session : le boss se connecte ensuite avec son nouveau mot de passe (et son TOTP hors du magasin), comme toute connexion.

**Reste** : T-016c, T-016d (dont l'écran d'activation du boss).

**Questions** : aucune.

## 05/10/2026 — T-016a : comptes gérés par l'admin, côté API — agent : Claude Code (Opus 5.5)

**Fait** :
- T-016 découpée en quatre (backlog) : a) API des comptes, b) code d'activation du boss, c) changement de mot de passe imposé et `admin:bootstrap`, d) écran de l'admin.
- `GET /users` : tous les comptes, désactivés compris, avec la présence des secrets (jamais leur valeur).
- `POST /users` : identifiant (unique sans tenir compte de la casse, sans espace), nom, un ou plusieurs rôles fixes (RG-USR-01/02), lettre de ticket exigée d'un commercial (RG-USR-07) ; aucun secret à la création.
- `PATCH /users/{id}` : seuls les champs donnés changent ; jamais de suppression, une désactivation (RG-USR-06). Un changement de rôles ou une désactivation ferme toutes les sessions du compte, celle de l'admin comprise s'il se modifie lui-même.
- Journal : `user.created`, `user.updated`, `user.deactivated` (avant → après des seuls champs changés), puis `user.sessions_revoked`.
- Contrats partagés `packages/shared/src/users.ts` ; codes d'erreur `USERNAME_TAKEN`, `TICKET_LETTER_REQUIRED`, `TICKET_LETTER_TAKEN`, `LAST_ADMIN`.
- 7 tests d'API (`users-accounts.test.ts`) ; lint, format et typecheck verts. Pas de `.env` sur le poste : les tests avec base tournent sur la CI.

**Décisions** :
- Garde technique `LAST_ADMIN` : le dernier admin actif ne perd ni son rôle ni son activité, sinon plus personne ne gère les comptes. Ce n'est pas une règle métier nouvelle, seulement l'impossibilité de se priver d'administration.

**Reste** : T-016b (code d'activation du boss), T-016c, T-016d.

**Questions** : aucune.

## 05/10/2026 — H56 validée (devis et commandes du commercial) — agent : Claude Code (Opus 5.5)

**Fait** :
- L'utilisateur valide H56 telle quelle. CDC métier v0.17 : sa ligne passe du §16.2 au nouveau §16.13 ; RG-CMD-05b, RG-CMD-08 et le tableau des états (§5.2) citent la décision.
- Marques ⚠️ retirées du CDC technique, du backlog, de CLAUDE.md et des commentaires du code.
- Aucun changement de comportement : T-035a à T-035c suivaient déjà H56.

**Reste** : aucune hypothèse ouverte ; prochaine tâche à prendre au backlog.

**Décisions** : H56 (§16.13).

**Questions** : aucune.

## 05/10/2026 — T-035c : « Renvoyer au commercial » à la caisse — agent : Claude Code (Opus 5.5)

**Fait** :
- Caisse, contrôle de la commande : bouton « Renvoyer au commercial » à côté de « Annuler la commande », en un clic (RG-CMD-05b) :
  - la commande redevient un devis, garde son ticket et sa place (H56) ;
  - message « Commande A1 — Nom renvoyée au commercial : elle garde son ticket et sa place. », file relue ;
  - commande changée entre-temps : message d'erreur et commande relue, comme pour les autres actions de la caisse.
- Le commercial en est averti sur sa tablette (fait en T-035b).
- 1 test de composant ajouté ; lint, typecheck, 267 tests web verts.
- Graphe graphify du code mis à jour (lecture du code par `graphify query`, demande du 05/10).

**Reste** :
- T-035 terminée (a, b, c).

**Décisions** : aucune nouvelle dépendance ; pas de confirmation avant le renvoi (« renvoi en un clic », RG-CMD-05b).

**Questions** : valider H56 (CDC métier §16.2) ?

## 04/10/2026 — T-035b : « Mes devis et commandes » sur la tablette — agent : Claude Code (Opus 5.5)

**Fait** :
- Écran de saisie : un bouton « Mes devis et commandes » ouvre la liste du commercial :
  - numéro, client, état, total (MGA) ; ticket affiché ; marques « Renvoyée par la caisse » et « Périmé » ;
  - recherche par numéro (devis d'un collègue, nom du commercial affiché) ;
  - liste relue à chaque changement d'état d'une commande (temps réel).
- Actions selon l'état :
  - devis → « Reprendre » : lignes, client et remises rechargés, chaque article relu au catalogue (unités, stock) ; un article disparu garde l'unité enregistrée ; si l'écran a des modifications non enregistrées, confirmation avant de les perdre ;
  - commande validée ou à la caisse → « Annuler » avec motif (feuille d'annulation de la caisse réutilisée) ;
  - commande expirée → « Réactiver » ; refusée (prix, stock, remise), le message dit qu'elle est redevenue devis (H56).
- Avis au commercial quand la caisse renvoie une de ses commandes.
- 5 tests de composant ajoutés ; lint, typecheck, 266 tests web verts.

**Reste** :
- T-035c (bouton « Renvoyer au commercial » à la caisse).
- `Source/.env.example` : modifié par l'utilisateur, à commiter par lui.

**Décisions** : aucune nouvelle dépendance.

**Questions** : valider H56 (CDC métier §16.2) ?

## 04/10/2026 — T-035a : devis et commandes du commercial (API) — agent : Claude Code (Opus 5.5)

**Fait** :
- CDC métier v0.16 : hypothèse ⚠️ H56 (§16.2) pour ce que le CDC laissait ouvert :
  - liste du commercial : ses devis et commandes non payées, les dernières modifiées d'abord ; le responsable voit celles de tous ; un devis d'un collègue se retrouve par son numéro ;
  - commande renvoyée par la caisse : elle redevient devis, garde son ticket et sa place dans la file si elle est revalidée le même jour ; son stock est libéré entre-temps ;
  - réactivation d'une commande expirée : en fin de file, ticket gardé s'il est du jour ; refusée (prix changé, stock insuffisant, remise au-delà du plafond), la commande redevient devis à reprendre ;
  - tableau des états (§5.2), RG-CMD-05b et RG-CMD-08 mis en cohérence.
- API :
  - `GET /quotes` (avec `?number=`) : la liste, devis périmé signalé ;
  - `POST /orders/{id}/send-back` : renvoi par le caissier qui a appelé la commande ou le responsable ; nouvel événement `queue.changed` `sent_back` ;
  - `POST /orders/{id}/reactivate` : réactivation par le commercial de la commande ou le responsable ; une réponse perdue renvoyée rend la commande ;
  - journal d'audit : `order.sent_back`, `order.reactivated`, `order.reopened` (avec le motif du refus) ;
  - l'annulation avec motif existait déjà (T-050).
- 5 tests d'API et 1 test partagé ajoutés ; lint, typecheck, 658 tests verts.
- T-035 découpée en T-035a (API, faite), T-035b (tablette), T-035c (bouton de la caisse).

**Reste** :
- T-035b, T-035c.
- `Source/.env.example` : modifié par l'utilisateur, non commité par l'agent (il ne lit pas les fichiers `.env*`) : à commiter par l'utilisateur.

**Décisions** : aucune nouvelle dépendance.

**Questions** : valider H56 (CDC métier §16.2) ?

## 04/10/2026 — H55 validée (notification push au boss) — agent : Claude Code (Opus 5.5)

**Fait** :
- L'utilisateur valide H55 telle quelle. CDC métier v0.15 : sa ligne passe du §16.2 au nouveau §16.12 ; RG-DSH-05 cite la décision.
- Marques ⚠️ retirées du CDC technique, du backlog, de CLAUDE.md, des commentaires du code et d'un titre de test ; la migration déjà appliquée garde la sienne (la modifier changerait sa somme de contrôle).
- Aucun changement de comportement : T-033e suivait déjà H55.

**Reste** :
- `Source/.env.example` à compléter par l'utilisateur (variables VAPID, voir l'entrée T-033e).
- T-035 (devis et commandes du commercial).

**Décisions** : aucune hypothèse ouverte (§16.2).

**Questions** : aucune.

## 04/10/2026 — Mise en cohérence des droits du boss (CDC métier v0.14) — agent : Claude Code (Opus 5.5)

**Fait** :
- Contradiction relevée : RG-REM-01 (décisions H15, H40), RG-STK-02 (H45) et RG-DEV-06 (H49 b) laissent le boss fixer les plafonds de remise, la durée de réservation et les articles à promouvoir, alors que RG-DSH-07, le rôle Boss (§3), l'annexe B et le glossaire disaient qu'il ne modifie rien hors remises exceptionnelles.
- CDC métier v0.14 :
  - RG-DSH-07 : le boss modifie les remises exceptionnelles, les plafonds de remise et le plafond général, la durée de réservation générale et par client, les articles à promouvoir ; tout le reste en lecture ;
  - rôle Boss (§3) : mêmes droits ;
  - annexe B : ligne Paramètres (le boss modifie le plafond général et la durée de réservation) ; deux lignes ajoutées : « Articles à promouvoir » et « Durée de réservation d'un client ».
- Glossaire : Responsable (voit les plafonds de remise sans les changer) et Boss (mêmes droits que RG-DSH-07).
- Code déjà conforme : les plafonds de remise ne se changent que par le boss (`requireRole('owner')`, `routes/discount-caps.ts`). Aucun changement de code.
- Graphe de connaissance du dépôt généré par graphify dans `graphify-out/` (non versionné).

**Reste** :
- T-022b (durée de réservation) et T-037 (articles à promouvoir) se codent selon le texte corrigé.
- `graphify-out/` n'est pas dans `.gitignore` : à ajouter si le dossier doit rester local.
- T-035 (devis et commandes du commercial).

**Décisions** :
- Droits de lecture des deux nouvelles lignes de l'annexe B, proposés par l'agent et acceptés par l'utilisateur : les articles à promouvoir sont lus par le commercial, le responsable et l'admin ; la durée de réservation d'un client est lue par le responsable, modifiée par le boss et l'admin.
- Pas de nouvelle hypothèse : les textes suivent des décisions déjà prises.

**Questions** : valider H55 (CDC métier §16.2) ?

## 03/10/2026 — T-033e : notification push au boss — agent : Claude Code (Opus 5.5)

**Fait** :
- Serveur :
  - chaque nouvelle demande de remise part en notification push vers les appareils du boss, application fermée, juste après l'enregistrement de la demande ;
  - le message : « Demande de remise : *client* », chaque remise demandée (« Remise sur le total : … », « Remise sur *article* : … », 3 au plus, « et N autres »), le total de la commande, le motif et le demandeur ; une notification par demande ;
  - le service de push garde le message jusqu'à l'expiration de la demande (24 h au plus) ; un appareil que le service dit disparu est oublié ;
  - routes réservées au boss : clé publique, enregistrement et retrait de l'appareil, message d'essai (5 par minute) ; seules les adresses des services de push de Google, Mozilla, Apple et Microsoft sont acceptées ;
  - nouvelle table `push_subscriptions` (migration `20261003120000_add_push_subscriptions`) ; 10 appareils au plus par compte ; ajouts et retraits journalisés, jamais l'adresse ni les clés de l'appareil ;
  - variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` : les trois ou aucune (push désactivé) ; une paire incohérente est refusée au démarrage.
- Application :
  - zone « Notifications sur cet appareil » dans le panneau des demandes du boss : Activer, Envoyer un essai, Désactiver ;
  - elle dit quand le navigateur ne peut pas les recevoir, quand il faut d'abord ajouter l'application à l'écran d'accueil (iPhone, iPad), quand le magasin ne les a pas configurées, quand elles sont bloquées dans le navigateur ;
  - le service worker affiche le message reçu ; un toucher ouvre l'application ou la ramène au premier plan.
- Revue en workflow (relecture serveur et navigateur, puis vérification) : 4 défauts confirmés et corrigés :
  - chaque ligne du message dit « Remise sur … » (une remise sur le total se lisait comme le total de la commande) ;
  - sur iPhone et iPad, les notifications bloquées se débloquent dans Réglages, puis Notifications : le texte le dit ;
  - un refus dans la question du navigateur est dit dans la bande, et le focus va sur la phrase au lieu de se perdre ;
  - un test de durée de garde du message échouait parfois, à cheval sur une seconde.
  Écartés : un message d'erreur distinct pour les navigateurs sans service de push (Chrome ne permet pas de distinguer une coupure d'Internet) ; l'icône SVG que Chrome n'affiche pas (cosmétique, icônes PNG avec T-010).
- Tests : +37 (API 14 dont 4 sur les variables, partagé 5, web 18 : interrupteur, appareil, service worker).

**Reste** :
- ⚠️ `Source/.env.example` est à compléter par l'utilisateur (l'agent n'a pas le droit de lire les fichiers `.env*`) : `VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=mailto:…`. Clés à générer une fois par `pnpm --filter @vente-web/api exec web-push generate-vapid-keys --json` et à placer dans `.env` ; sans elles, le push reste désactivé et le boss voit « non configuré ».
- Le serveur doit être à l'heure (NTP) : un horodatage faux fait refuser les messages par les services de push.
- Sur Android, l'économiseur de batterie peut retarder les notifications : à vérifier sur le téléphone du boss.
- Icônes PNG des notifications avec T-010 ; en-tête `Cache-Control: no-cache` de `sw.js` et `push-sw.js` dans Caddy avec T-080.
- T-035 (devis et commandes du commercial).

**Décisions** :
- Dépendance `web-push` 3.6 (MPL-2.0, 17 paquets, aucun script d'installation) : chiffrement des messages (RFC 8291) et signature VAPID (RFC 8292), largement utilisée et maintenue. Écartées : `@block65/webcrypto-web-push` et `pushforge` (peu utilisées) ; un chiffrement écrit à la main (risque d'erreur sur la cryptographie).
- Dépendance de développement `@types/web-push` : les types de `web-push`, qui n'en fournit pas.
- ⚠️ HYPOTHÈSE H55 (CDC métier v0.13, RG-DSH-05, §16.2) : activation appareil par appareil, abonnement gardé à la déconnexion, détail de la demande visible sur l'écran verrouillé, décision dans l'application seulement.
- Pas de file d'attente ni de nouvel essai : un envoi échoué est journalisé, la demande reste visible dans l'application.

**Questions** : valider H55 (CDC métier §16.2) ?

## 03/10/2026 — T-033b, c, d : demandes de remise à l'écran — agent : Claude Code (Opus 5.5)

**Fait** :
- Tablette (T-033b) :
  - feuille « Demander au boss » : remise par article et/ou sur le total, en % ou en montant, motif pris dans la liste, note ; un devis jamais enregistré l'est d'abord ;
  - pendant l'attente, une marque remplace les boutons ; le devis, le code et le client sont figés ; retrait possible avec l'accord du client ;
  - la réponse du boss est annoncée dans la bande ; un accord applique son code aussitôt.
- Écran du boss (T-033c) :
  - chaque demande en attente avec sa commande et le motif ; accord élément par élément (valeur demandée, autre valeur ou rien) ou refus en un geste ;
  - le code à transmettre est affiché ; les demandes closes du jour sont listées ; la liste « Codes du jour » suit les accords ;
  - le responsable voit le même panneau en lecture seule, et il est avisé de chaque nouvelle demande.
- Caisse et supervision (T-033d) :
  - marque « Remise demandée » dans les files de la caisse et du responsable (en attente et en service) ;
  - le caissier peut demander au boss ; « Encaisser » est bloqué pendant l'attente ; retrait avec l'accord du client, ou commande remise en file à sa place ;
  - « Suivant » nomme la commande que l'appel prendra vraiment, en sautant celle qui attend ; la réponse du boss est dite, avec le ticket pour une commande remise en file.
- Revue en workflow (relecture puis vérification) : 18 défauts confirmés et corrigés. Exemples :
  - une feuille restait ouverte ou se rouvrait seule après un changement d'état ;
  - le focus se perdait quand un bouton disparaissait ;
  - une remise sur le total saisie pendant l'attente était perdue à l'arrivée du code ;
  - une décision bloquait toutes les cartes du boss au lieu d'une seule ;
  - un motif non lu (Wi-Fi) n'offrait pas « Réessayer » ;
  - le titre de l'écran du boss venait après celui du panneau.
- Tests : web +34 (demandes sur la tablette, à la caisse, écran du boss, supervision, codes du jour, coquille) ; format:check, lint, typecheck (0 erreur) ; suite complète : 615 tests verts.

**Reste** : T-033e (notification push au boss) ; T-035 (devis et commandes du commercial).

**Décisions** :
- Aucune dépendance ajoutée.
- La marque « Remise demandée » est indigo, comme le code du boss, dans les trois vues de file.
- Une feuille ouverte se ferme quand l'état change (code ou demande arrivés d'ailleurs) et ne se rouvre jamais seule ; le focus va sur ce qui remplace le bouton.
- Une remise sur le total saisie et non enregistrée est gardée à l'arrivée de l'accord, sauf si le code couvre le total ; elle est revérifiée avec le code au prochain enregistrement.
- Le panneau des demandes relit la liste quand la commande d'une carte change (baissée à la caisse, annulée, payée).

**Questions** : aucune.

## 03/10/2026 — H51 à H54 validées — agent : Claude Code (Opus 5.5)

**Fait** :
- L'utilisateur valide les hypothèses des demandes de remise exceptionnelle telles qu'écrites :
  - H51 : qui demande (commercial, caissier, responsable), sur quoi, motif pris dans la liste ;
  - H52 : ce qui est bloqué pendant l'attente, la commande remise en file à la caisse ;
  - H53 : décision du boss élément par élément, l'accord devient un code rattaché aussitôt ;
  - H54 : retrait, expiration en fin de journée, suivi par le boss.
- CDC métier (v0.12) : les quatre lignes passent du §16.2 au nouveau §16.11. Les règles RG-CMD-07, RG-FIL-03, RG-REM-03/04/05, RG-DSP-04 et RG-DSH-05 citent la décision au lieu de l'hypothèse ; en-tête et §16.2 à jour.
- CDC technique, backlog, CLAUDE.md, commentaires du code et intitulés des tests : les marqueurs ⚠️ de ces hypothèses sont retirés (la migration déjà appliquée garde le sien : on ne la modifie pas). Aucun changement de comportement : l'API de T-033 suivait déjà ces hypothèses.
- format:check, lint et typecheck verts.

**Reste** : T-033b (tablette), T-033c (écran du boss), T-033d (caisse et supervision), T-033e (notification push) ; T-035 (devis et commandes du commercial).

**Décisions** : H51 à H54 validées (§16.11). Plus aucune hypothèse ouverte.

**Questions** : aucune.

## 02/10/2026 — T-033 demandes de remise exceptionnelle (API) — agent : Claude Code (Opus 5.5)

**Fait** :
- Base : tables `discount_requests` (motif, note, statut, qui, quand, échéance) et `discount_request_items` (article ou total, demandé en % ou en montant, accordé ou non) ; contraintes CHECK sur les dates et les statuts.
- API :
  - `POST /discount-requests` depuis un devis ou une commande en file (commercial, caissier, responsable), motif pris dans le paramètre `discount_reasons` ;
  - `GET /discount-requests` (boss, responsable) : en attente, la plus ancienne d'abord, et closes depuis le début de la journée ;
  - accord du boss élément par élément : un code émis pour la commande et utilisé aussitôt, comme à la saisie ; refus ; retrait (demandeur, caissier qui tient la commande, responsable) ;
  - `POST /orders/{id}/set-aside` : le caissier remet la commande en file, à sa place, pendant que le boss décide.
- Pendant l'attente : paiement, saisie d'un code et changement de client refusés ; « Appeler le suivant » saute la commande ; la file affiche `discountPending`. L'annulation retire la demande ; le balayage l'expire à la fin de journée. Tout est journalisé ; avis en temps réel au boss, au responsable, au commercial et à la file caisse.
- Revue (2 relecteurs puis vérification) : 4 défauts corrigés :
  - la commande expirée en file laissait sa demande en attente : le balayage la clôt avec elle ;
  - « Appeler le suivant » pouvait prendre une commande dont la demande venait d'être faite : nouvelle lecture une fois la commande verrouillée ;
  - la liste du jour coupait à 100 avant de trier : elle trie sur la clôture, puis coupe ;
  - une demande échue mais pas encore balayée bloquait encore le paiement et se retirait.
- Tests : API 17 (demandes, accords, courses et fins de journée) ; format:check, lint, typecheck (0 erreur), suite complète : 581 tests verts.

**Reste** : T-033b (tablette), T-033c (écran du boss), T-033d (caisse et supervision), T-033e (notification push) ; T-035 (devis et commandes du commercial).

**Décisions** : aucune dépendance ajoutée. ⚠️ H51 à H54 inscrites (CDC métier §16.2) et codées selon leur formulation : qui demande et avec quel motif (H51), ce qui est bloqué pendant l'attente et la remise en file à la caisse (H52), l'accord élément par élément (H53), le retrait, l'expiration et le suivi par le boss (H54).

**Questions** : valider H51 à H54.

## 01/10/2026 — H38 à H42 et H49 validées — agent : Claude Code (Opus 5.5)

**Fait** :
- L'utilisateur valide les propositions telles qu'écrites :
  - H38 : indicateurs de la supervision ;
  - H39 : ajustements de stock ;
  - H40 : plafonds de remise ;
  - H41 : codes de remise ;
  - H42 : saisie du code sur un devis ou à la caisse ;
  - H49 : modalités des remarques du boss — catégories de client tenues par l'admin, articles à promouvoir marqués par le boss seul, validation du responsable à la caisse par son identifiant.
- CDC métier : les six lignes passent du §16.2 au §16.10. Les règles RG-DEV-04, RG-DEV-06, RG-STK-05/06, RG-REM-01/04 et RG-DSP-04 citent la décision au lieu de l'hypothèse ; en-tête et §16.9 à jour.
- CDC technique, backlog, CLAUDE.md et commentaires du code : les marqueurs ⚠️ de ces hypothèses sont retirés. Aucun changement de comportement : le code suivait déjà ces propositions.

**Reste** : T-033 (demandes de remise) ; T-035 (devis et commandes du commercial) ; T-029b, T-037, T-017c suivent H49.

**Décisions** : H38 à H42 et H49 validées (§16.10). Plus aucune hypothèse ouverte.

**Questions** : aucune.

## 01/10/2026 — T-034d commande jamais gratuite (H50) — agent : Claude Code (Opus 5.5)

**Fait** :
- H50 tranchée par l'utilisateur : la proposition (encaisser une commande à 0,00 MGA sans moyen de paiement) est refusée ; l'alternative est retenue. CDC métier §16.10, RG-PAY-02 et RG-REM-04 mises à jour.
- API : refus 422 avant toute écriture.
  - Un code qui amènerait le total à 0,00 MGA, sur le devis comme à la caisse : `DISCOUNT_CODE_FREE_ORDER`. Le code reste actif, inutilisé.
  - La validation d'un devis à 0,00 MGA et une baisse ou une suppression de ligne à la caisse qui y mènerait : `ORDER_TOTAL_ZERO`.
  - Un devis enregistré à 0,00 MGA reste permis : c'est un brouillon.
- Tablette : « Valider » à 0,00 MGA est refusé tout de suite, sans rien envoyer. Caisse et feuille du code : le refus de l'API s'affiche avec son libellé.
- Revue (2 relecteurs) : l'en-tête du CDC métier cite H50 ; le libellé du refus parle du total, plus seulement des articles.
- Tests : API 2, tablette 1, caisse 2 ; format:check, lint, typecheck (0 erreur), suite complète : 564 tests verts.

**Reste** : T-033 (demandes de remise) ; T-035 (devis et commandes du commercial).

**Décisions** : aucune dépendance ajoutée. H50 refusée (§16.10) : une commande n'est jamais gratuite.

**Questions** : valider H38 à H42 et H49.

## 01/10/2026 — T-034c code du boss saisi à la caisse, nommé sur la facture — agent : Claude Code (Opus 5.5)

**Fait** :
- API `POST /orders/{id}/discount-code` (caissier qui a appelé la commande, ou responsable) : le code applique ses remises sur les prix et plafonds figés ; les lignes non couvertes gardent leur remise validée ; un total non couvert est ramené à la marge restante ; un seul code par commande ; UTILISÉ et journalisé dans la même transaction.
- Contrôles du code mis en commun entre devis et commande (`usableCode`, `useCode`).
- Facture : l'instantané garde le code ; le PDF affiche « Code de remise » dans l'en-tête (RG-REM-07). Une facture plus ancienne, sans ce champ, se lit toujours.
- Caisse : bouton « Code du boss » à côté de « Annuler la commande » ; une étiquette le remplace une fois le code appliqué ; une réponse perdue sur le Wi-Fi est retrouvée en relisant la commande, ou quand le même code est saisi à nouveau.
- Revue (2 relecteurs) : la saisie répétée après une réponse perdue est corrigée ; la commande amenée à 0,00 MGA, qui ne s'encaisse pas (déjà possible depuis T-034b), est inscrite ⚠️ H50.
- Tests : API 3 + PDF 1, caisse 7 ; format:check, lint, typecheck (0 erreur), suite complète : 558 tests verts, puis 1 test de caisse ajouté après la revue (559).

**Reste** : T-034d (commande à 0,00 MGA, ⚠️ H50) ; T-033 (demandes de remise) ; T-035 (devis et commandes du commercial).

**Décisions** : aucune dépendance ajoutée. ⚠️ H42 complétée (§16.2) : saisie à la caisse et mention sur la facture. Le PDF du devis ne nomme pas le code : RG-REM-07 ne le demande que sur la facture. Les baisses de la caisse enregistrent désormais aussi l'origine de la remise sur le total (code ou plafond). ⚠️ H50 inscrite (§16.2) : une commande à 0,00 MGA s'encaisse sans moyen de paiement.

**Questions** : valider H38 à H42, H49 et H50.

## 01/10/2026 — T-034b code du boss saisi sur la tablette — agent : Claude Code (Opus 5.5)

**Fait** :
- Tablette : bouton « Code du boss » sous le tableau ; la feuille de saisie enregistre d'abord le devis s'il a changé, puis rattache le code ; une étiquette remplace le bouton, le client ne change plus ; les lignes couvertes portent une clé.
- Remises accordées recalculées sur la tablette comme l'API (`grantsFor`) : une ligne encore à sa part suit cette part quand les quantités changent ; une remise saisie à part est gardée ; le pavé et la feuille du total affichent le maximum accordé, ou disent que le code ne couvre pas la ligne ou le total.
- Corrections de la revue (API et tablette) :
  - le total non couvert dont la marge diminue est ramené à la marge restante, et la bande le dit ;
  - un prix changé depuis l'enregistrement est refusé à la saisie du code : le devis passe au nouveau prix, à vérifier avec le client ;
  - une réponse perdue sur le Wi-Fi : le devis relu dit si le code est passé ;
  - ce qui a été saisi pendant l'envoi reste à enregistrer ;
  - un refus arrivé après la fermeture de la feuille va dans la bande ; le focus passe sur l'étiquette du code.
- Tests : API 4, brouillon 25, écran du code 11 ; format:check, lint, typecheck (0 erreur), suite complète : 548 tests verts.
- Reprise après le plantage du PC : aucun travail perdu.

**Reste** : T-034c (saisie du code à la caisse avant paiement, mention sur la facture) ; T-033 (demandes de remise).

**Décisions** : aucune dépendance ajoutée. ⚠️ H42 complétée (§16.2) : total ramené à la marge restante, prix changé vérifié avant la saisie du code, remise au-delà du plafond ramenée avant, part qui suit les quantités.

**Questions** : valider H38 à H42 et H49.

## 29/09/2026 — Remarques du boss tranchées (pas de code) — agent : Claude Code (Opus 5.5)

**Fait** :
- Réponses de l'utilisateur consignées au CDC métier, §16.9 : H43 reformulée (le client reste identifié individuellement, il est seulement classé dans une catégorie : « Divers », « Régulier », « Gros contrat »…) ; H44 reportée (gestion du crédit en V1.1) ; H45 à H48 validées.
- Règles réécrites : RG-USR-03 (identifiant saisi), RG-DEV-04 (catégorie, date du dernier achat), RG-DEV-06 (rangée « À proposer »), RG-STK-02 et RG-CMD-08 (durée de réservation générale et par client).
- Backlog : T-029b, T-022b, T-037, T-038, T-017c en MVP, « À faire » ; T-029c en V1.1.

**Reste** : ⚠️ H49, les modalités restantes (liste des catégories et qui les attribue, qui marque les articles à promouvoir, validation du responsable à la caisse sans liste des noms) ; reprise du code avec T-034b après la réinitialisation hebdomadaire.

**Décisions** : celles de l'utilisateur ci-dessus ; aucune dépendance.

**Questions** : valider H38 à H42 et H49.

## 29/09/2026 — Remarques du boss consignées (pas de code) — agent : Claude Code (Opus 5.5)

**Fait** :
- Six remarques du boss, transmises par l'utilisateur, inscrites ⚠️ H43 à H48 au CDC métier (§16.2) avec une proposition et une alternative : client divers, conditions du client et vente à crédit, durée de réservation générale et par client, articles à promouvoir, historique des achats du client, connexion sans la liste des utilisateurs.
- Backlog : T-029b, T-029c, T-022b, T-037, T-038, T-017c, statut « À trancher », lot à confirmer.
- « Chaque profil n'a droit qu'à sa propre interface » : déjà en place (annexe B, RG-USR-02) ; un utilisateur à plusieurs rôles choisit son rôle et ne voit que cet espace.

**Reste** : la décision du boss sur H43 à H48, et leur lot (MVP ou V1.1) ; reprise du code avec T-034b (champ de saisie sur la tablette) quand la limite hebdomadaire sera réinitialisée.

**Décisions** : aucune ; la vente à crédit (H44), absente des CDC, est proposée en V1.1.

**Questions** : valider H38 à H48.

## 29/09/2026 — T-034b code de remise saisi sur un devis (API) — agent : Claude Code (Opus 5.5)

**Fait** :
- Moteur de remise (paquet partagé) : une remise accordée par un code remplace le plafond de la ligne ou du total couverts ; un montant sur un article en plusieurs lignes se répartit au prorata de leur brut ; 2 tests ajoutés.
- API `POST /quotes/{id}/discount-code`, 2 tests d'intégration :
  - le code saisi (casse, tiret indifférents) applique ses remises au-delà des plafonds, passe UTILISÉ, reste sur le devis ; réenregistré, le devis peut aller jusqu'à la remise accordée, pas au-delà ; la validation passe ;
  - refus : code inconnu, d'un autre client, déjà utilisé, ne couvrant rien du devis ; un second code sur le même devis.
- Les baisses de la caisse gardent les remises du code ; un devis avec un code ne change plus de client.
- Vérifications : format:check, lint, typecheck (0 erreur), suite complète : 527 tests verts.

**Reste** : T-034b, le champ de saisie du code sur la tablette ; T-034c (saisie à la caisse, mention sur la facture) ; T-033 (demandes de remise).

**Décisions** : aucune dépendance ajoutée. ⚠️ H42 inscrite (§16.2) : un seul code par commande, UTILISÉ dès sa saisie sur le devis ; sa remise remplace le plafond des lignes et du total couverts ; un code qui ne couvre rien est refusé. T-034b est scindée : la caisse et la facture passent en T-034c.

**Questions** : valider H38 à H42.

## 29/09/2026 — T-034 codes de remise émis par le boss — agent : Claude Code (Opus 5.5)

**Fait** :
- Base : les remises d'un code passent dans `discount_code_items` (un article, ou le total ; un pourcentage ou un montant) ; `discount_codes` garde le client, la commande, l'état et les dates, avec des contraintes sur UTILISÉ et RÉVOQUÉ.
- API, 3 tests d'intégration :
  - émission pour un client : code lisible (groupes de 4, sans 0, O, 1, I, L), valable jusqu'à la fin de la journée, journalisé ;
  - refus : aucune remise, deux fois le même article, article retiré de la vente, client inactif ;
  - révocation une seule fois, expiration par le balayage existant (audit système), liste vide le jour suivant.
- Écran du boss, 2 tests : chercher le client, ajouter des articles et/ou le total avec % ou montant, émettre ; le code à transmettre s'affiche en grand ; tableau « Codes du jour » avec l'état et « Révoquer ».
- Vérifications : format:check, lint, typecheck (0 erreur), suite complète : 523 tests verts.

**Reste** : T-034b (saisie du code sur un devis ou à la caisse, application au-delà des plafonds, usage unique, mention sur la facture) ; T-033 (demandes de remise, le code qui y répond).

**Décisions** : aucune dépendance ajoutée. ⚠️ H41 inscrite (§16.2) : le code vise un client, chaque remise porte sur un article ou sur le total, en % ou en montant ; un montant sur un article à plusieurs lignes se répartit au prorata de leur brut (T-034b).

**Questions** : valider H38, H39, H40 et H41.

## 29/09/2026 — T-024 plafonds de remise fixés par le boss — agent : Claude Code (Opus 5.5)

**Fait** :
- API, 2 tests d'intégration :
  - lecture des plafonds : général, par catégorie, et par article avec le plafond appliqué à chaque unité de vente ;
  - modification par le boss seul (plafond général, catégorie, article, unité de vente), journalisée avant → après ; un champ vidé retire le plafond propre ; refus au-delà de 100 %.
- Écran du boss, 3 tests : plafond général, tableau des catégories, recherche d'un article puis ses unités (plafond propre, plafond appliqué). Le responsable voit le même écran sans pouvoir modifier.
- Constat vérifié dans le code : un devis recalcule prix et plafonds à chaque enregistrement ; seule la commande validée fige ses plafonds.

**Reste** : rien pour T-024 ; au-delà des plafonds, la remise passe par un code du boss (T-034).

**Décisions** : aucune dépendance ajoutée. ⚠️ H40 inscrite (§16.2) : le boss fixe aussi le plafond général ; un devis prend le nouveau plafond à son prochain enregistrement ; pas d'avis en direct aux commerciaux.

**Questions** : valider H38, H39 et H40.

## 29/09/2026 — T-023 ajustements de stock et alertes de seuil — agent : Claude Code (Opus 5.5)

**Fait** :
- API, 3 tests d'intégration :
  - `GET /products/{id}/stock` : où en est le stock, les unités de vente, les motifs ;
  - `POST /products/{id}/stock/adjustments` : un mouvement `ADJUSTMENT` en unité de base, la ligne de stock verrouillée, l'audit avant → après avec motif et commentaire ; sortie refusée au-delà du disponible ;
  - `GET /stock/alerts` et l'événement `stock.alert`, envoyé après un ajustement ou une validation de commande.
- Écran du responsable, 3 tests : articles sous leur seuil (annoncés dès qu'un nouveau apparaît), recherche d'un autre article par code ou désignation, fiche d'ajustement (retirer ou ajouter, quantité, unité, motif, commentaire).
- Correction en route : `upsert` sur `product_stock` échouait sur la contrainte `CHECK` (Postgres la vérifie sur la ligne candidate à l'insertion) ; la ligne existante est désormais modifiée, sinon créée.
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), suite complète : 513 tests verts. Aucune dépendance ajoutée.

**Reste** : alertes de seuil dans le tableau de bord du boss (avec son écran) ; écran de l'admin pour les ajustements assistés.

**Décisions** : le commentaire libre est rangé dans l'audit, pas dans `stock_movements` (aucun changement de schéma).

**Questions ouvertes** : ⚠️ H39, ajustement en unité de vente, commentaire facultatif, sortie plafonnée au disponible (CDC métier §16.2) ; ⚠️ H38 toujours ouverte.

## 29/09/2026 — H36 et H37 validées, T-042 supervision du responsable — agent : Claude Code (Opus 5.5)

**Décisions de l'utilisateur** : H36 et H37 validées telles quelles (CDC métier §16.8) ; poursuivre jusqu'à 80 % de l'usage hebdomadaire.

**Fait** :
- CDC (`1df52fb`) : H36 et H37 inscrites comme décisions, marques ⚠️ retirées du code et des CDC.
- T-042, API, 2 tests d'intégration : `GET /supervision/today` (responsable, boss) — attentes moyennes du jour en caisse et en livraison, commandes en cours, payé non livré (nombre et montant).
- T-042, écran du responsable, 9 tests :
  - bandeau des indicateurs du jour, relu à chaque changement de file ou de commande et chaque minute ;
  - files caisse et livraison en direct : qui est servi, par qui, où, depuis quand ; puis rang, ticket, client, commercial, montant, attente ;
  - glisser-déposer par une poignée (événements pointeur, donc au doigt sur tablette), flèches haut et bas au clavier ; bouton « Prioritaire » ;
  - annulation d'une commande en file caisse avec son motif ; « Remettre en file » d'une commande tenue à un comptoir.
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur) et 506 tests verts. Aucune dépendance ajoutée : le glisser-déposer est écrit à la main (le glisser-déposer HTML ne marche pas au doigt).

**Reste** : état des remises dans la supervision avec les demandes de remise (T-033) ; correction du stock manquant ou abîmé (T-023).

**Décisions** : le motif facultatif d'un déplacement (RG-FIL-02) n'est pas demandé à l'écran, pour ne pas freiner le glisser-déposer ; le journal d'audit trace quand même qui, quand, avant → après.

**Questions ouvertes** : ⚠️ H38, définition des indicateurs du jour (CDC métier §16.2).

## 29/09/2026 — Reprise en local après la session cloud, T-061 anomalies de livraison et avoir partiel — agent : Claude Code (Opus 5.5)

**Demande de l'utilisateur** : vérifier le travail de la session cloud, corriger sans compte-rendu, puis continuer ; plafond d'usage hebdomadaire relevé à 80 %.

**Fait** :
- Relecture du travail cloud, corrections :
  - `a3960c2` (API) : rang conservé au réordonnancement, expiration traitée commande par commande, lectures et écritures de PDF plus sûres ;
  - `c435eb7` (écran) : fiche de clôture maintenue jusqu'à la clôture, coches remises à zéro à chaque remise, comptoirs prévenus des commandes payées.
- T-061, API (`94bd051`, `94df321`), 3 tests d'intégration :
  - le magasinier signale, par ligne, la quantité non remise et sa cause (manquant, abîmé), commentaire facultatif ; la commande passe « anomalie », le comptoir est libre ;
  - le responsable remet en file (à sa place) ou fait livrer partiellement : sortie de stock du seul livré, réservation du reste libérée, reste à rembourser figé (règle H37) ;
  - à la caisse, avoir partiel sur le compteur `AV-` sans trou, un seul moyen, facture « partiellement créditée », effet sur la clôture ; PDF.
- T-061, écrans, 4 tests :
  - comptoir : bouton « Signaler une anomalie », fiche par ligne (quantité, cause, commentaire), quantité supérieure à la commande refusée ;
  - responsable : panneau « Anomalies de livraison », prévenu en direct, « Remettre en file » ou « Livrer partiellement », reste à rembourser affiché ;
  - caisse : « Annuler ou rembourser une vente » ; une vente livrée partiellement montre la décision, les lignes non remises et le reste ; ni motif ni PIN (le responsable a déjà décidé), bouton « Rembourser … ».
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur) et 495 tests verts. Aucune dépendance ajoutée.

**Reste** : correction du stock manquant ou abîmé par ajustement motivé (T-023) ; bouton de remise en file d'une commande en livraison avec la supervision (T-042).

**Décisions** : le panneau des anomalies vit dans l'espace du responsable (pas encore d'écran de supervision, T-042).

**Questions ouvertes** : H36, H37.

## 28/09/2026 — H35 validée, T-053 annulation après paiement et avoir — agent : Claude Code (Opus 5.5)

**Décisions de l'utilisateur** : H35 (clôture de caisse) validée telle quelle (CDC métier §16.7) ; T-053 avant T-061 (les avoirs d'abord).

**Fait** :
- CDC (`ce81300`) : ⚠️ H36 ouverte (annulation après paiement et avoir).
- API (`f558604`), 4 tests d'intégration :
  - recherche d'une vente par le numéro de facture (espaces et casse ignorés) ;
  - annulation d'une commande payée, pas encore prise en charge au comptoir, sur **nom et PIN du responsable** : mauvais PIN compté comme à la connexion, caissier refusé comme validateur ;
  - avoir `AV-2026-000001`, compteur par année **sans trou**, contenu figé, PDF stocké et réimprimé tel quel ;
  - remboursement d'un seul moyen, référence exigée selon le moyen, rattaché à la session de caisse du caissier ;
  - réservation libérée, commande « remboursée », facture « créditée » (jamais modifiée autrement), journal ;
  - clôture : remboursements par moyen, espèces attendues diminuées des espèces rendues, rapport de clôture complété.
- Écran de caisse (`ae9afdd`, `9f37d76`), 3 tests : bouton « Annuler une vente payée » ; numéro de facture → vente (ticket, client, paiement, montant) ; motif, moyen de remboursement (celui du paiement proposé), référence si besoin ; le responsable **choisit son nom** dans la liste et tape son PIN ; puis « Ouvrir l'avoir ». Vente au comptoir ou déjà livrée : raison affichée, pas d'annulation. La fiche de clôture montre les remboursements.
- PDF de l'avoir : « Total de la facture » au lieu de « Net à payer » (un avoir ne se paie pas) ; test du gabarit.
- Format de date `JJ/MM/AAAA` à l'heure du magasin ajouté aux règles partagées (RG-FMT-03).
- Vérifié dans l'application réelle : F-2026-000002 (13 000,00 MGA en espèces) retrouvée, PIN faux refusé, avoir AV-2026-000001 émis, PDF contrôlé ; clôture : 100 000 + 39 000 − 26 000 (2 avoirs) = 113 000 attendus.
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur) et 469 tests verts. Aucune dépendance ajoutée.

**Reste** : avoir partiel (RG-ANN-03) avec T-061 ; annulation d'une commande en préparation après remise en file par le responsable (T-042) ; remboursement en plusieurs moyens et validation depuis l'écran du responsable non prévus (H36).

**Questions ouvertes** : H36.

## 28/09/2026 — Compte-rendu pour le boss, H34 validée, T-054 clôture de caisse — agent : Claude Code (Opus 5.5)

**Demande de l'utilisateur** : un compte-rendu HTML pour son boss (ce que l'application sait faire, par catégories, avec captures). Fichier autonome livré à l'utilisateur (images intégrées, 1,7 Mo), non versionné. Captures refaites sur la galerie de démonstration.

**Décision de l'utilisateur** : H34 (livraison) validée telle quelle (CDC métier §16.7). Marqueurs ⚠️ des hypothèses H32 à H34 retirés du code et du CDC technique (`a28b660`, `e72cee9`).

**Fait** :
- CDC (`839f2eb`) : ⚠️ H35 ouverte (modalités de la clôture).
- API (`a4d73f0`), 5 tests d'intégration, 2 tests du calcul partagé, 1 de l'heure du magasin :
  - encaissements de la session par moyen de paiement ; espèces attendues = fond + part en espèces ;
  - clôture : client à la caisse refusé, écart calculé, commentaire obligatoire si écart, clôture définitive et journalisée ; une nouvelle session peut s'ouvrir ;
  - rapport de clôture PDF (caissier, responsable, boss ; jamais un autre caissier) ;
  - sessions du jour pour le responsable et le boss, session oubliée d'un jour précédent signalée.
- Écrans (`7945f82`), 2 tests :
  - à la caisse, « Clôturer la caisse » : tableau par moyen, espèces attendues, comptage, écart en direct, commentaire, puis rapport ;
  - chez le responsable et le boss, « Caisses du jour » : état (ouverte, clôturée à…, oubliée), encaissé, écart, rapport.
- Vérifié dans l'application réelle : Caisse 1, fond 50 000 ; espèces 90 000 (2 paiements), MVola 45 000 ; attendues 140 000, comptées 139 000, écart −1 000 avec commentaire. PDF contrôlé, liste du responsable juste.
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), `build` et 459 tests verts. Aucune dépendance ajoutée.

**Reste** : export Excel du rapport (T-071) ; validation de la clôture par le responsable [V1.1] ; anomalies de livraison (T-061).

**Questions ouvertes** : H35.

## 28/09/2026 — H33 validée, T-060 livraison — agent : Claude Code (Opus 5.5)

**Décision de l'utilisateur** : H33 (facture) validée telle quelle (CDC métier §16.7). `FILES_DIR` ajouté par l'utilisateur à `Source/.env.example` (`6adfdd1`).

**Fait** :
- CDC (`d2fc586`) : ⚠️ H34 ouverte (modalités de la livraison) ; deux sorties ajoutées au §5.2 : « En préparation → Payée » et « Prête → Payée » (retour en file).
- API (`fa54b73`), 4 tests d'intégration :
  - prise en charge de la suivante ou d'un ticket précis, une commande à la fois par magasinier, à son nom ;
  - « prête » : ticket appelé au comptoir ;
  - remise ligne par ligne : **sortie de stock** (un mouvement par ligne, en unité de base), stock et réservé diminués, réservation consommée, commande livrée, journal ;
  - client absent : retour en fin de file, toujours payé ; remise en file par le responsable, à sa place.
- Écran du comptoir (`16eb23d`), 4 tests : file livraison (attente depuis le paiement, sans montants), « Prendre la suivante », liste de préparation (unité de vente et équivalence en unité de base), « Commande prête », ticket et nom en grand, cases à cocher, « Livrer », « Client absent ».
- File, tableau et résumé de file communs à la caisse et au comptoir ; libellés de la caisse sortis dans `labels-register.ts`, ceux du comptoir dans `labels-delivery.ts`.
- Vérifié dans l'application réelle, deux comptoirs : Feno prend A2 et Tahina la voit « Comptoir de Feno Magasinier » ; A2 est appelée, cochée puis livrée. L'eau passe de 180 à 150 en stock et de 48 à 18 réservées (5 packs × 6 bouteilles).
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), `build` et 449 tests verts. Aucune dépendance ajoutée.

**Reste** : anomalies de livraison (T-061) ; bouton « remettre en file » du responsable avec la supervision (T-042) ; nom du comptoir avec l'appairage des postes (T-015) ; clôture de caisse (T-054).

- CI : le push `6adfdd1` était rouge sur un test web instable (`realtime.test.tsx` vérifiait la connexion temps réel avant qu'elle soit ouverte, sur la CI plus lente) ; sans rapport avec `.env.example`. Test rendu robuste (attente explicite), 3 passages verts de suite.

**Questions ouvertes** : H34.

## 28/09/2026 — H32 validée, T-052 facture — agent : Claude Code (Opus 5.5)

**Décision de l'utilisateur** : H32 (encaissement) validée telle quelle (CDC métier §16.7).

**Fait** :
- CDC (`9c85993`) : ⚠️ H33 ouverte (modalités de la facture). Paramètre `vat_notice` ajouté au §13. Deux tâches détachées : T-056 (arrondi espèces) et T-057 (TVA avec prix hors taxes, V1.1).
- API (`aaaf2d6`), 4 tests d'intégration, 3 du gabarit, 3 du calcul partagé :
  - la facture est émise dans la transaction même du paiement, après tous les contrôles ; numéro `F-2026-000001`, compteur par année du magasin ;
  - **sans trou** : prouvé par des paiements simultanés, un paiement refusé et un paiement qui échoue après avoir pris son numéro ; dans les deux derniers cas, le numéro est rendu ;
  - contenu figé : mentions légales, date et heure, ticket, commande, commercial, caissier, client, lignes, totaux, TVA ventilée (HT, TVA, TTC) ou mention, paiements, reçu et rendu ;
  - PDF écrit dans `files/invoices/<année>/<numéro>.pdf` juste après le paiement, rouvert tel quel ; un fichier perdu est refait une seule fois depuis le contenu figé ;
  - blocs du PDF (magasin, client, tableau, totaux) communs au devis et à la facture ;
  - nouvelle variable d'environnement `FILES_DIR` (défaut `files`). ⚠️ `Source/.env.example` est à compléter par l'utilisateur : l'agent n'a pas le droit de le lire.
- Caisse (`ec95a97`), 1 test complété : le bandeau cite le numéro de facture ; « À votre caisse » garde le dernier encaissement avec « Ouvrir la facture ».
- Vérifié dans l'application réelle : paiement de A3 (2 lignes, remises ligne et total, 80 000,00 MGA, reçu 100 000, rendu 20 000) → facture `F-2026-000001` ; PDF contrôlé visuellement ; deux ouvertures donnent le même fichier, octet pour octet.
- Défaut trouvé et corrigé en cours de route : un PDF resté d'une base remise à zéro aurait été servi pour une nouvelle facture de même numéro. Désormais, seul le fichier enregistré par la facture fait foi.
- Outil de vérification : PyMuPDF, installé hors du projet pour regarder le PDF ; ce n'est pas une dépendance du code.
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), `build` et 440 tests verts. Aucune dépendance ajoutée.

**Reste** : arrondi espèces (T-056) ; code de remise du boss sur la facture (T-034) ; clôture de caisse (T-054) ; points mineurs de la relecture.

**Questions ouvertes** : H33.

## 28/09/2026 — H31 validée, T-051 encaissement — agent : Claude Code (Opus 5.5)

**Décision de l'utilisateur** : H31 (expiration et réactivation) validée telle quelle (CDC métier §16.7).

**Fait** :
- CDC (`37f805c`) : ⚠️ H32 ouverte. Un paiement doit être rattaché à une session de caisse ouverte (RG-PAY-07), prévue en T-054, et le choix du poste à la connexion n'existe pas (T-015). T-051 inclut donc l'**ouverture** de la caisse : choix de la caisse, fond de caisse.
- API (`0e2990a`), 7 tests d'intégration et 5 tests du calcul partagé :
  - ouverture de caisse, une par personne et une par caisse (index partiels uniques), journalisée ;
  - `POST /orders/{id}/pay` : paiement simple ou mixte dont la somme est exactement le net à payer ; une ligne en espèces au plus, avec montant reçu et rendu ; référence exigée selon le moyen, carte comprise (RG-PAY-04) ;
  - clé d'idempotence : le même paiement envoyé deux fois, même en même temps, n'est enregistré qu'une fois ;
  - commande payée, réservation ferme jusqu'à la livraison, entrée en file livraison, journal avant → après ;
  - l'appel d'un ticket enregistre la caisse ouverte (« A15 → Caisse 2 ») ;
  - migration : colonne `idempotency_key`, index « une session ouverte par caisse », carte bancaire avec référence.
- Écran de caisse (`02c99bc`), 7 tests :
  - panneau « Ouvrir la caisse » tant qu'aucune n'est ouverte ; personne ne peut être appelé avant ;
  - bouton « Encaisser » : espèces pour le tout par défaut, autres moyens ajoutés pour un paiement mixte, référence, montant reçu et rendu affichés en direct ; bouton actif seulement quand le compte est juste ;
  - une nouvelle tentative après une coupure réseau garde la même clé.
- Points mineurs de la relecture corrigés au passage : nom du client avec le ticket dans trois messages (RG-TKT-03), rejet de promesse non traité, commande de la caisse protégée des réponses dans le désordre et relue à la reconnexion.
- Vérifié dans l'application réelle : ouverture de Caisse 1 (fond 50 000), appel de A2, paiement mixte 10 000 espèces + 45 000 MVola avec référence, reçu 20 000, rendu 10 000 ; commande payée, réservation ferme, stock toujours réservé jusqu'à la livraison (RG-STK-04).
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), `build` et 431 tests verts. Aucune dépendance ajoutée.

**Reste** : facture numérotée et PDF, arrondi espèces (T-052) ; clôture de caisse (T-054) ; blocage du paiement tant qu'une demande au boss est en attente (T-033) ; points mineurs restants de la relecture (entrée « Relecture » ci-dessous).

**Questions ouvertes** : H32.

## 28/09/2026 — T-022 expiration des commandes en fin de journée — agent : Claude Code (Opus 5.5)

**Fait** :
- API (`95d6e44`), 2 tests d'intégration : tâche interne toutes les 30 s et au démarrage (`plugins/expiry.ts`). Une commande en file non payée à sa fin de journée passe `EXPIRED`. Son stock réservé revient au disponible, dans l'ordre des articles. Le journal note `order.expired` sans auteur. La file caisse et le commercial sont avertis. Une transaction par commande ; 100 au plus par passage.
- Tablette (`7a0806d`), 1 test : le bandeau du commercial annonce « Commande A1 de … expirée : non payée à la fin de la journée, son stock est libéré. » (`CallNotices` devient `OrderNotices`).
- Vérifié dans l'application réelle :
  - au démarrage, les 11 commandes non payées des 26 et 27/09 de la base de dev ont expiré (stock réservé revenu à 0, 11 entrées au journal) ;
  - une commande du jour (ticket A1, sans doublon) échue à la main dans la base de dev a expiré en 18 s : bandeau du commercial, sortie de la file caisse, eau disponible 150 → 180.
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), `build` et 412 tests verts. Aucune dépendance ajoutée.

**Décisions** : ⚠️ H31 (CDC métier §16.2) :
- seule une commande en file expire ; un client à la caisse reste au caissier, et sa commande expire s'il est ensuite déclaré absent ;
- réactivation proposée pour T-035 : par le commercial ou le responsable, mêmes contrôles qu'une validation ; si un prix a changé, la commande redevient un devis au nouveau prix.

**Reste** : réactivation (T-035) ; expiration des codes de remise (T-034) et des paniers de borne (T-036) ; points mineurs de la relecture (entrée précédente).

**Questions ouvertes** : H31.

## 28/09/2026 — Relecture de T-018 à T-050 : 4 défauts corrigés — agent : Claude Code (Opus 5.5)

**Contexte** : relecture du code faite à part par l'utilisateur (Claude Code en local). CI de `7df1d0e` verte. Auteur git des commits désormais « Fenitra » (`git config` en début de session ; l'historique n'est pas réécrit).

**Décisions de l'utilisateur** (CDC métier v0.8, §16.7) :
- H30 (contrôle à la caisse) validée telle quelle ;
- C7 : un client absent perd sa priorité, de même qu'une commande prioritaire placée en dernier par le responsable ; journalisé avant → après (RG-FIL-02, RG-FIL-04).

**Fait** (un commit par défaut, chacun avec son test, qui échoue sans la correction) :
- `01dd7ba` — **blocage mutuel sur le stock** : `shrinkReservations` libère les articles dans l'ordre de leur identifiant, comme `reserveStock` les verrouille. Une annulation ou une baisse croisant une validation attend au lieu de finir en erreur 40P01 (500). Priorité avant T-022, qui libérera beaucoup de stock d'un coup.
- `a282053` — CDC : H30 et C7.
- `619d322` — **priorité perdue** à l'absence et au placement en dernier ; le journal d'une priorité enregistre aussi la nouvelle position (point mineur `queues.ts:254`).
- `95c6591` — **« Appeler le suivant » ne répond plus « file vide » à tort** : appels, réordonnancements et priorités d'une file prennent un verrou de transaction propre à la file (`pg_advisory_xact_lock`) ; l'appel lit sans `SKIP LOCKED`. Règle aussi deux réordonnancements simultanés (point mineur `queues.ts:185`).
- `1de1305` — **fenêtre d'une ligne à la caisse** : elle suit l'article (unité de vente, unique dans une commande), plus son numéro ; elle se ferme si la ligne a disparu.
- `ad833d6` — doublon supprimé : en-tête des colonnes de montants et bloc des totaux communs au devis et à la commande (`ui/DocumentTable.tsx`).
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), `build` et 409 tests verts. Aucune dépendance ajoutée.

**Reste — points mineurs de la relecture**, corrigés quand une tâche touche le fichier :
- `order-changes.ts` : quantité baissée qui fait 0 en unité de base → 500 au lieu de 400 ; tests manquants : annulation par le commercial d'une commande déjà appelée, baisse par le responsable, contenu des journaux `order.adjusted` et `order.cancelled`, remise sur le total ramenée au plafond ;
- `login.ts:192` : ordre des verrous entre une connexion et la fermeture de l'ancienne session ;
- `customers.ts:147` : `updateCustomer` lit la fiche sans la verrouiller ; tests du déclencheur `customer_phones` (échange des deux numéros, numéros libérés par fusion ou désactivation) ;
- `prisma/seed.ts:94` : téléphones des clients de démonstration non normalisés ;
- `register/useOrderAtRegister.ts` : réponses dans le désordre, commande non relue après reconnexion ;
- `register/RegisterWorkspace.tsx:53` : rejet de promesse non traité ;
- caisse : trois messages affichent le ticket sans le nom du client (RG-TKT-03).

**Ensuite** : T-022, puis T-051.

**Questions ouvertes** : aucune.

## 27/09/2026 — H29 validée, T-050 contrôle à la caisse — agent : Claude Code (Opus 5.5)

**Reprise après le crash du PC** : rien de perdu, tout était poussé (`3fd8258`, CI verte). Seul PostgreSQL local était arrêté.

**Décision de l'utilisateur** : H29 (files d'attente) validée telle quelle (CDC métier §16.6).

**Fait** :
- API (`4ab1991`, `d47c476`), avec 6 tests d'intégration :
  - `POST /orders/{id}/adjust` : le caissier qui a appelé la commande (ou le responsable) baisse une quantité ou supprime une ligne (RG-CMD-05b) ; totaux recalculés, réservations réduites ou libérées, journal avant → après ; ni ajout, ni dernière ligne ;
  - `POST /orders/{id}/cancel` : annulation avant paiement avec motif obligatoire (RG-ANN-01) ; commercial pour ses commandes, caissier, responsable ; stock libéré, ticket clos ;
  - les lignes indiquent l'origine de leur remise (plafond ou code du boss).
- Écran de caisse (`f183b3e`), avec 6 tests :
  - client appelé → sa commande en tableau (RG-DEV-05), origine de chaque remise, totaux ;
  - la quantité ouvre un pavé qui la baisse ou supprime la ligne ;
  - « Annuler la commande » avec motif ;
  - mise en page : commande à gauche, ticket à annoncer et file condensée à droite (portrait : ticket, commande, file).
- Vérifié dans l'application réelle : validation, appel, baisse, suppression, annulation, avec le stock disponible juste à chaque étape (150 → 120 → 132 → 150).
- Vérifications : `format:check`, `lint`, `typecheck` (0 erreur), `build` et 405 tests verts. Aucune dépendance ajoutée.
- Incident : `4ab1991` a été committé avec deux erreurs de typage dans un test (fixture du PDF sans `discountSource`), corrigées aussitôt par `d47c476`, avant tout envoi.

**Décisions** : ⚠️ H30 (CDC métier §16.2). La remise d'une ligne baissée suit la quantité. La remise sur le total garde son % ou son montant, ramenée au maximum permis si les lignes restantes ne la couvrent plus. La dernière ligne ne se supprime pas. Le motif d'annulation est libre et obligatoire.

**Constat** : la file du jour contient encore des commandes non payées d'hier (tickets « A1 » en double). Leur expiration en fin de journée est T-022, non faite : à passer en priorité.

**Reste** :
- saisie du code du boss à la caisse (T-034), blocage du paiement sans code (T-033) ;
- renvoi au commercial et liste de ses commandes (T-035, créée) ;
- paiement (T-051).

**Questions ouvertes** : H30.

## 26/09/2026 — T-040 files d'attente, écran de caisse — agent : Claude Code (Opus 5.5)

**Fait** :
- API (`f215a0e`, RG-FIL-01 à 04, RG-CMD-06), avec 8 tests d'intégration :
  - `GET /queues/{register|delivery}` : qui est servi, puis qui attend, par rang ;
  - appel du suivant, ou d'un ticket hors tour (journalisé) ; deux caisses n'ont jamais le même ticket ; un client à la fois par caisse ;
  - absent : retour en fin de file, absences comptées, réservation conservée ;
  - responsable : déplacer un ticket, le marquer prioritaire, avec un motif journalisé ;
  - événements temps réel pour chaque changement ;
  - table des transitions d'état partagée (CDC métier §5.2).
- Écran de caisse (`8a81a66`), avec 10 tests :
  - file en direct (rang, ticket, client, commercial, montant, attente) ; « Appeler le suivant » qui nomme le ticket ; « Appeler » sur une ligne ;
  - client appelé en très grand avec son nom, à annoncer (RG-DSP-05) ; bouton « Client absent » ;
  - la tablette du commercial est prévenue de l'appel de son ticket en mode appel verbal ; le responsable est prévenu à la 2ᵉ absence.
- Vérifié dans l'application réelle (API + Vite, deux navigateurs) : validation, appel, annonce, absence, avis au commercial. Ce contrôle a révélé un défaut, corrigé : un retour après absence était annoncé comme une nouvelle commande. `queue.changed` porte désormais la nature du changement.
- Galerie : écrans `caisse` et `caisse-appel`, contrôlés en paysage et en portrait sans défilement horizontal.
- Vérifications : `format:check`, `lint`, `typecheck`, `build` et 393 tests verts. Aucune dépendance ajoutée.

**Décisions** : ⚠️ H29 (CDC métier §16.2) : un client à la fois par caisse ; « prioritaire » = derrière les autres prioritaires ; attente comptée depuis la validation ; commercial prévenu en appel verbal seulement.

**Reste** :
- appel et absence au comptoir de livraison avec la livraison (T-060) ;
- glisser-déposer du responsable (T-042) ;
- « retirer » un ticket = annulation (T-050) ;
- encaissement (T-051).

**Questions ouvertes** : H29.

## 26/09/2026 — Décisions H14 à H28 appliquées — agent : Claude Code (Opus 5.5)

**Décisions de l'utilisateur** (CDC métier v0.7, §16.5) :
- validées telles quelles : H14, H16, H17, H19, H23, H24, H25, H28 ;
- H15 : plafonds de remise fixés par le boss seul ; plus de colonne de plafond à l'import ;
- H20 : l'admin ne pose jamais le mot de passe du boss ; code d'activation à usage unique (24 h) remis au boss (RG-USR-10) ;
- H21 : une session par personne, une nouvelle connexion ferme l'ancienne ; poste obligatoire dans le magasin (RG-USR-09) ;
- H26 : deux téléphones au plus par client ;
- H27 : devis daté du jour de sa création.

**Fait** :
- CDC métier v0.7 : règles démarquées, RG-USR-09/10 ajoutées, RG-REM-01, RG-DEV-04, RG-FAC-06, annexes A et B mises à jour ; `CLAUDE.md` : plus d'hypothèse ouverte ; commentaires du code : décisions citées au lieu des ⚠️.
- H27 (`eab1c8f`) : le PDF du devis porte le jour de création, validité comptée depuis.
- H20 (`933f455`) : `PUT /users/:id/password` refuse un compte boss (`OWNER_PASSWORD_SELF_ONLY`).
- H21 (`d173cbc`) : la connexion verrouille le compte et ferme ses autres sessions (`auth.session_replaced`) ; trois connexions simultanées laissent une seule session. Sept tests qui ouvraient deux sessions d'une même personne ont été réécrits.
- H26 (`3c860be`) : colonne `second_phone` ; table `customer_phones` tenue par un déclencheur, dont la clé garantit qu'un numéro n'appartient qu'à un client actif ; recherche sur les deux numéros ; formulaire de la tablette avec second téléphone facultatif. Migration appliquée sur base vide et sur base existante ; schéma Prisma et base concordent.
- Vérifications : `format:check`, `lint`, `typecheck`, `build`, seed lancé deux fois, 375 tests verts.

**Reste, inscrit au backlog** :
- T-016 : code d'activation du boss ;
- T-015 : poste obligatoire à la connexion dans le magasin ;
- T-024 (nouvelle) : saisie des plafonds par le boss ;
- T-020 : import sans colonne de plafond.

**Point de vigilance** : une tablette dont la session a été remplacée revient à l'écran de connexion avec « Connexion requise », sans dire qu'une connexion a eu lieu ailleurs.

**Questions ouvertes** : aucune.

## 26/09/2026 — T-018 temps réel (Socket.IO) — agent : Claude Code (Opus 5.5)

**Fait** :
- API, avec 9 tests (4 d'intégration sur un vrai serveur, 5 unitaires) :
  - Socket.IO sur le serveur HTTP de l'API, WebSocket seul ;
  - poignée de main refusée sans `Origin` du site (ou avec un `Sec-Fetch-Site` autre que `same-origin`), sans session valide, ou pour une session du magasin présentée de l'extérieur ;
  - session contrôlée par les règles HTTP sans prolonger l'inactivité, recontrôlée toutes les 30 s : session finie ou rôle changé → connexion coupée ;
  - salles par rôle, utilisateur, poste et file, déduites de la session ;
  - à la validation d'une commande : `queue.changed` à la file caisse, `order.status_changed` au responsable, au boss et au commercial ; identifiants seulement, émis après la transaction.
- Web, avec 4 tests : une connexion par session et par rôle, reconnexion au changement de rôle, fermeture à la déconnexion ; `useRealtimeEvent` ignore toute charge utile hors schéma. Premier écran branché : la caisse relit la commande et affiche « Nouvelle commande en file caisse : A15 — Rasoa Hanta » (RG-CMD-03).
- Vérifié dans l'application réelle (API + Vite, deux navigateurs) : la tablette valide, la caisse reçoit l'annonce.
- Vérifications : `format:check`, `lint`, `typecheck`, `build` et 366 tests verts.

**Dépendances** :
- `socket.io` 4.8 (API) : prévu par ADR-0003 ; salles, reconnexion et diffusion prêtes à l'emploi. Écartés : `ws` seul (salles et reconnexion à réécrire), SSE (pas de canal par salle côté client, reconnexion moins maîtrisée).
- `socket.io-client` 4.8 (web ; aussi en développement dans l'API pour les tests) : 41,9 ko minifié, 13 ko compressé.

**Décisions** :
- WebSocket seul, sans requêtes de repli : rien d'autre que la poignée de main à protéger contre les requêtes intersites.
- Salle `user:<id>` en plus du CDC : les tablettes du commercial, faute de poste appairé (T-015).
- Rien n'est écrit en base par le temps réel : un événement perdu (coupure) est rattrapé en relisant la ressource ; les écrans de file (T-040) relisent la file à la reconnexion.

**Reste** : T-018 terminée. Suivant au backlog. Questions ouvertes inchangées : H28, H27, H26, H23, H24, H20 ; H14–H17, H19, H21, H25.

## 26/09/2026 — T-032 validation de commande — agent : Claude Code (Opus 5.5)

**Fait** :
- API (`3ec3c10`, RG-CMD-02/03/04, RG-STK-02, RG-TKT-01, RG-FIL-01), avec 10 tests d'intégration :
  - `POST /orders/:id/submit` (commercial, responsable) valide le devis enregistré sous la version lue, en une seule transaction : prix figés (la ligne référence le prix historisé en vigueur), plafonds relus, stock réservé par article jusqu'à la fin de journée, ticket du jour à la lettre du commercial, dernier rang de la file caisse, journal `order.submitted` (avant → après) ;
  - contrôle du stock en unité de base, lignes d'un même article cumulées, commandes validées non livrées déduites ; lignes de stock verrouillées dans l'ordre des articles : deux commandes ne prennent jamais les mêmes dernières unités ;
  - refus nommés : stock insuffisant (chaque article, disponible et demandé, ses lignes), prix changé depuis l'enregistrement, plafond abaissé, version périmée, commercial sans lettre ;
  - une validation renvoyée par la même tablette (réponse perdue sur le Wi-Fi) rend son ticket au lieu d'un refus ; `GET /orders/:id` lit une commande quel que soit son état.
- Tablette (`c70a24d`), avec 10 tests :
  - bouton « Valider la commande » à côté du net à payer ; il enregistre d'abord ce qui est à l'écran et s'arrête si l'enregistrement a changé le montant (le client vérifie avant toute réservation) ;
  - ticket affiché en 96 px avec le nom du client (RG-CMD-05, RG-TKT-03), puis « Nouveau devis » ;
  - stock insuffisant : feuille par article (« 40 disponibles, 50 demandés (kg) ») avec la quantité que le stock couvre, lignes concernées en garance jusqu'à leur modification ;
  - prix changé après l'enregistrement : le devis est réenregistré au nouveau prix, à revalider.
- Galerie : écrans `commande-validee` et `commande-stock`. Captures contrôlées en paysage (1280 × 800) et en portrait (800 × 1280), sans défilement horizontal.
- Vérifications : `format:check`, `lint`, `typecheck`, `build` et 353 tests verts ; CI verte pour `3ec3c10`. Aucune dépendance ajoutée.

**Décisions** :
- ⚠️ H28 (CDC métier §16.2) : la commande garde le numéro du devis ; validation sur le devis tel qu'enregistré ; reprise par un autre commercial à son nom et à sa lettre, le responsable valide pour le commercial du devis ; une réservation par article jusqu'à la prochaine `day_end_time`.
- Notification temps réel des caisses détachée dans **T-018** (Socket.IO, socle), prérequis de la file caisse T-040 : aucun écran ne la reçoit encore.
- `Sheet` : pied de feuille en `<div>` (un `<footer>` dans la boîte de dialogue faisait un second repère `contentinfo`). Échelle typographique : taille 96 pour le ticket.

**Points de vigilance** : les codes du boss (T-034) devront être relus à la validation comme les plafonds ; l'expiration en fin de journée et la libération des réservations restent à faire (T-022).

**Reste** : T-032 terminée. Suivant au backlog. Questions ouvertes : H28 à valider ; H27, H26, H23, H24, H20 ; H14–H17, H19, H21, H25.

## 26/09/2026 — Tableaux : « MGA » une seule fois, dans l'en-tête — agent : Claude Code (Opus 5.5)

**Demande de l'utilisateur** : « pour tout ce qui est tableau, ne mets pas MGA partout dans les colonnes de montant pour gagner de l'espace ».

**Fait** (`ebd700c`) :
- RG-FMT-01 et RG-DEV-05 amendées (CDC métier), invariant de `CLAUDE.md` aussi : dans un tableau, les cellules de montant montrent le nombre seul (`1 500,00`) et l'en-tête porte « (MGA) » une seule fois, en deuxième ligne.
- Partagé : `CURRENCY` et `formatAmount` (le nombre seul) ; `formatMga` s'appuie dessus.
- Tablette : Prix unitaire, Remise et Montant net portent « (MGA) » sous leur nom ; ces colonnes rétrécissent et la Désignation gagne 56 px. Sans défilement horizontal en paysage (1280 × 800) comme en portrait (800 × 1280) ; 15 000 000,00 tient encore.
- PDF A4 : mêmes en-têtes, calés en bas ; colonnes de montants plus étroites.
- Vérifications : `format:check`, `lint`, `typecheck` et 324 tests verts ; écran et PDF contrôlés à l'œil.

**Décision** : les totaux sous le tableau, les cartes d'articles, le pavé et les phrases gardent « MGA » après chaque montant : ils sont lus isolément, sans en-tête de colonne.

**Reste** : suivant au backlog (T-032). Question ouverte : H27, date du devis.

## 26/09/2026 — T-030 devis : PDF A4 (étape d), T-030 terminée — agent : Claude Code (Opus 5.5)

**Fait** (`eeec587`) :
- API : `GET /quotes/:id/pdf` produit le devis enregistré en A4 (RG-DEV-05, RG-FAC-06, RG-FAC-07) :
  - en-tête : mentions légales du paramètre `store.legal`, seulement les champs remplis, jamais le nom de l'application (RG-APP-01) ; à droite « Devis », le numéro, la date, la validité et le commercial ;
  - client avec un liseré indigo, puis le même tableau et les mêmes totaux que l'écran ; l'en-tête du tableau se répète sur chaque page et une ligne n'est jamais coupée ;
  - mention « Devis — valable jusqu'au … — ne vaut pas facture » sur fond safran ; pied de page : texte libre de `store.legal` et « Devis D-… — page 1 sur 3 » ;
  - mêmes lecteurs que le devis (le magasinier est refusé) ; ouvert dans le navigateur (`inline`), jamais mis en cache.
- Tablette : une fois le devis enregistré et inchangé, le bouton d'enregistrement cède la place à « Ouvrir le PDF », qui ouvre un onglet où imprimer ou partager (RG-PDF-01). Nouvelle icône `document`.
- Dépendances (API) :
  - `pdfmake` : produit le PDF côté serveur sans navigateur sans interface (CDC technique §9, ADR-0003) ; tableaux, pagination et en-têtes répétés inclus ;
  - `@fontsource/asap` : les fichiers de la police Asap des écrans, embarqués dans chaque PDF (rien ne dépend des polices du serveur) ;
  - `@types/pdfmake` (développement).
  pdfmake ne lit que ces fichiers de police : aucune adresse réseau, aucun autre fichier.
- Vérifications : `format:check`, `lint`, `typecheck` et 323 tests verts (7 nouveaux : dates du magasin, gabarit, route) ; PDF d'exemple de 6 et 40 lignes contrôlés à l'écran.

**Décisions** :
- Le PDF est refait à chaque ouverture depuis le devis enregistré, jamais conservé : un devis change jusqu'à sa validation, et seule la facture est figée (RG-FAC-04).
- ⚠️ H27 (CDC métier §16.2) : date du devis = son dernier enregistrement ; validité = `quote_validity_days` jours après, à l'heure du magasin.
- Le lien n'apparaît que sur un devis enregistré et non modifié : le PDF ne montre jamais autre chose que ce qui est enregistré.

**Points de vigilance** :
- Pas de TVA sur le devis tant qu'elle est désactivée (RG-FAC-03) ; à reprendre quand elle sera activable.
- Asap n'a pas de glyphe pour l'espace fine insécable (U+202F) : les montants utilisent l'espace insécable ordinaire, qui s'affiche bien.
- T-080 (paquet du serveur) devra embarquer les fichiers de police de `@fontsource/asap` ; `pnpm dist` ne construit encore que l'application web.

**Reste** : T-030 terminée. Suivant au backlog.

## 26/09/2026 — T-030 devis : enregistrement (étape c) — agent : Claude Code (Opus 5.5)

**Fait** :
- API (`f90d53b`, RG-DEV-01/02/04, RG-REM-01/02, RG-AUD-01), avec 5 tests :
  - `POST /quotes` (commercial) : la tablette n'envoie que le client, les unités, les quantités et les remises. Le serveur prend le prix en vigueur et relit les plafonds en base ; un prix envoyé par la tablette est ignoré (RG-ART-07) ;
  - numéro `D-AAAA-nnnnnn` tiré d'un compteur par année du magasin (fuseau `Indian/Antananarivo`) ; le préfixe `D` est un paramètre ;
  - `PUT /quotes/:id` (commercial auteur ou responsable) : enregistre par-dessus la version lue ; un devis enregistré entre-temps ailleurs est refusé (409), jamais écrasé. Un devis validé en commande n'est plus modifiable ;
  - `GET /quotes/:id` : commercial, caissier, responsable, boss, admin ; jamais le magasinier (annexe B) ;
  - refus nommés : client absent, inconnu ou désactivé ; unité retirée de la vente (lignes citées) ; remise au-delà du plafond (lignes et/ou total cités) ;
  - chaque création et modification est journalisée, avant → après.
- Tablette (`22328b7`), avec 6 tests :
  - bouton « Enregistrer le devis » sous le net à payer, puis « Enregistrer les modifications » ;
  - avant l'envoi, l'écran vérifie le client et les plafonds ; sinon la bande du bas dit pourquoi ;
  - statut à côté du titre : « Brouillon non enregistré », « Devis D-2026-… », ou « …, modifié, non enregistré » ;
  - les prix et plafonds affichés sont réalignés sur ceux renvoyés par le serveur ; un refus cite les lignes concernées.
- Galerie : écran `devis-enregistre`. Aucune dépendance ajoutée.
- Vérifications : `format:check`, `lint`, `typecheck` et 316 tests verts ; CI verte pour `f90d53b` ; captures contrôlées en paysage et en portrait.

**Décisions** :
- « Modifié, non enregistré » compare le contenu envoyé au contenu affiché : reconfirmer la même quantité ne marque rien ; ce qui est tapé pendant l'enregistrement reste marqué non enregistré.
- Une modification remplace toutes les lignes du devis (positions renumérotées).
- Numéro de devis : un trou est toléré (transaction annulée), contrairement aux factures (RG-FAC-01).

**Points de vigilance** :
- TVA non appliquée aux devis pour l'instant (désactivée par défaut, RG-FAC-03).
- T-033 : les demandes de remise pointent vers des lignes de commande. Or une modification du devis recrée ses lignes : il faudra des lignes stables ou un rattachement par position.
- Refus « devis modifié ailleurs » (409) : la bande l'affiche, mais aucun écran ne permet encore de recharger le devis. Cela viendra avec la liste des devis.
- Les tests de l'API affichent un avertissement de dépréciation de `pg`, venu de l'adaptateur Prisma et non de notre code.

**Reste** : T-030 (d) PDF du devis.

## 26/09/2026 — T-030 devis : tableau et remises (étapes a et b) — agent : Claude Code (Opus 5.5)

**Fait** :
- Tableau du devis refait (`7ec5d53`) : 7 colonnes, sans défilement horizontal à 1280 × 800 ni en portrait 800 × 1280. Les totaux sont sous le tableau, dans l'ordre de RG-DEV-05. Le plafond de chaque ligne vient de l'unité remontée par l'API (plus de `0` figé).
- Saisie des remises (`9ecba9a`, RG-REM-02, RG-REM-06) :
  - sur une ligne, depuis le pavé de quantité, avec les mêmes touches, en % ou en MGA. Le maximum est affiché avant la saisie ; une touche qui le dépasserait est refusée, avec une alerte. « Valider » revérifie la remise contre la quantité tapée ;
  - une ligne sans plafond a son champ Remise désactivé ;
  - changer d'unité retire la remise de la ligne (elle était consentie sous un autre plafond) ;
  - sur le total, bouton « Remise sur le total » sous le tableau : une feuille montre le net à payer en direct ; le maximum est la marge laissée par les lignes (⚠️ H23). Si la remise dépasse ce maximum après une modification des lignes, une alerte rouge s'affiche sous les totaux.
- Pavé recomposé pour tenir en paysage (1280 × 800), clavier compris :
  - unités sur deux colonnes, chacune avec son prix et son stock ;
  - Quantité et Remise côte à côte ;
  - « Supprimer la ligne » dans l'en-tête, loin de « Valider ».
- Partagé : `formatTyped` groupe les milliers d'une valeur en cours de frappe (RG-FMT-01). Nouvelles icônes `percent` et `trash`. Aucune dépendance ajoutée.
- Vérifications : `format:check`, `lint`, `typecheck` et 158 tests web et partagés verts (7 nouveaux tests d'écran, 5 de calcul, 1 de brouillon) ; captures contrôlées en paysage et en portrait.

**Décisions** :
- Le plafond propre à chaque unité n'est plus répété sur les boutons d'unité du pavé : il figure dans l'indication « Au plus 5 %, soit … » sous la remise.

**Reste** : T-030 (c) enregistrement du devis côté serveur (recalcul, plafonds relus en base, journal, numéro `D-AAAA-nnnnnn`, client obligatoire, bouton bloqué hors plafonds) ; (d) PDF.

## 26/09/2026 — T-029 répertoire clients — agent : Claude Code (Opus 5.5)

**Fait** :
- Test de verrouillage des comptes rendu stable (`517c8da`) : les tentatives concurrentes s'écrivent au journal d'audit dans l'ordre où elles finissent, pas dans l'ordre de leurs créneaux. Le test vérifie désormais l'ensemble des actions et les compteurs 1 à 5, sans ordre.
- API du répertoire (`df5e77c`, RG-DEV-04), avec 15 tests :
  - `GET /customers?q=` : recherche par chiffres du téléphone (n'importe où dans le numéro, le numéro exact en tête) ou par débuts de mots du nom (sans casse ni accents) ; 8 résultats au plus, puis « précisez » ;
  - `POST /customers` (commercial) : nom et téléphone obligatoires, téléphone ramené à une forme unique (`0341234567`, ou `+indicatif` hors Madagascar) ; un numéro déjà connu est refusé (409) avec la fiche existante, y compris quand deux tablettes le créent en même temps (index unique partiel) ;
  - `PATCH /customers/:id` (commercial, caissier, responsable) : le journal ne garde que les champs changés ;
  - `POST /customers/:id/deactivate` et `/merge` (responsable) : jamais de suppression ; la fiche fusionnée est désactivée et pointe vers celle qui reste ; deux fusions croisées ne passent jamais toutes les deux (verrou des deux lignes dans un ordre fixe) ;
  - toutes les écritures sont journalisées (RG-AUD-01) ; le boss lit le répertoire à distance sans le modifier ; le magasinier n'y a pas accès.
- Écran du devis (`478284e`) : bouton « Choisir le client » dans l'en-tête du tableau, feuille de recherche pendant la frappe, création sur place pré-remplie avec ce qui a été tapé ; si le numéro est déjà connu, la feuille propose la fiche existante. Le brouillon garde le client choisi (6 tests).
- `Sheet` accepte un champ à focaliser à l'ouverture (`showModal` focalisait le bouton Fermer).
- Vérifications : `format:check`, `lint`, `typecheck` et tests verts ; CI verte pour `517c8da` et `df5e77c`.

**Décisions** :
- ⚠️ HYPOTHÈSE H26 (CDC métier §16.2) : format du téléphone et sens de la fusion. Les devis, commandes et factures restent sur la fiche fusionnée (une facture est figée, RG-FAC-02) ; l'historique du client réunit les fiches fusionnées.
- Création de fiche réservée au commercial, lecture de l'annexe B à la lettre ; correction ouverte au caissier et au responsable.
- Pas d'index trigramme pour la recherche : inutile au volume d'un magasin, à revoir si le répertoire dépasse quelques dizaines de milliers de fiches.

**Questions ouvertes** : H26 à valider ; les autres sont inchangées (H20, H23, H24 ; H14–H17, H19, H21, H25).

**Reste** : T-030 (tableau qui tient à 1280 px et en portrait, saisie des remises dans les plafonds, plafond venu du serveur, enregistrement recalculé et journalisé avec numéro `D-AAAA-nnnnnn`, PDF). L'écran de gestion du répertoire (correction, fusion) viendra avec l'espace du responsable.

## 26/09/2026 — Revue du travail de Google Gravity et réparations — agent : Claude Code (Opus 5.5)

Pendant la pause de Claude Code (limite des 5 heures), l'utilisateur a confié la suite à Google Gravity (Gemini 3.1 Pro), qui a fait 6 commits. Revue demandée par l'utilisateur.

**Constat** :
- `8a6128c` et `ee847fb` (T-017b, T-085) : commit du travail laissé par Claude Code, CI verte. Mais T-085 était déclarée terminée sans le nom branché côté écran, l'entrée « mockups » de `.claude/launch.json` pointait vers un dossier temporaire, et l'entrée de journal manquait (justification des polices, `APP_NAME`).
- `c4d331e`, `bddb859` (début de T-030, poussés) : la CI échoue au formatage.
  - Le tableau passe à 7 colonnes, mais il déborde à 1280 px : « Montant net » et le total sont coupés.
  - Le plafond de chaque ligne est fixé à `0` alors que chaque unité remonte déjà son plafond (`maxDiscountPct`).
  - Aucune saisie de remise à l'écran.
  - Un commentaire de `draft.ts` est corrompu par un échappement PowerShell.
- `429e9c7` (non poussé) : échoue au formatage, au lint et au typecheck, alors que le message affirme « Tests pass ».
  - `GET` et `POST /customers` sans authentification : les téléphones des clients sont exposés.
  - `POST /sales/quotes` croit le prix et le plafond envoyés par la tablette et traite chaque remise comme accordée : plafonds contournables (RG-REM-01/06).
  - Ni journal d'audit (RG-AUD-01), ni transaction, et un numéro de devis aléatoire.
  - Un identifiant de client de démonstration est codé en dur dans l'écran, avec des textes hors de `labels.ts`.
  - T-030 marquée « Terminé » et sa description effacée du backlog.
- Le journal contenait des octets nuls et des caractères de contrôle (échappements PowerShell) : Git le voyait comme un fichier binaire.

**Fait** :
- `429e9c7` annulé par `git revert` (`62f6812`) : l'historique est conservé ; clients et enregistrement seront refaits avec T-029 et T-030.
- T-085 terminée côté écran :
  - `vite.config.ts` prend `VITE_APP_NAME` et `VITE_APP_SHORT_NAME` (sinon `brand.json`) pour le manifeste et le titre de la page (`&` échappé) ;
  - `labels.appName` lit le nom défini à la construction, et les tests gardent le nom par défaut ;
  - vérifié avec `pnpm dist --nom "Épicerie Rasoa & fils" --nom-court "Rasoa"` : titre, manifeste, cadre et `nom.json` corrects ;
  - `dist.mjs` passe une ligne de commande unique au shell (avertissement Node DEP0190).
- Formatage rétabli (`DraftTable.tsx`, `draft.test.ts`), commentaire de `draft.ts` réparé, entrée « mockups » retirée de `.claude/launch.json`.
- Journal réécrit sans caractères corrompus : les deux entrées de Gravity sont résumées ci-dessous telles quelles sur le fond ; l'entrée T-017b/T-085 manquante est ajoutée.
- Vérifications : `format:check`, `lint`, `typecheck`, 261 tests et `build` verts.

**Décisions** :
- On garde l'état du brouillon de Gravity (remise par ligne et sur le total, client) ; l'écran du tableau est repris dans T-030.

**Questions ouvertes** : inchangées (H20, H23, H24 ; H14–H17, H19, H21, H25).

**Reste** : T-029 répertoire clients, puis T-030 (tableau qui tient dans l'écran, saisie des remises dans les plafonds, client, enregistrement journalisé, PDF).

## 26/09/2026 — T-030 devis, début du tableau — agent : Gemini 3.1 Pro (Google Gravity)

Entrée réécrite par Claude Code le 26/09 : l'original était corrompu (octets nuls). Voir l'entrée de revue ci-dessus.

**Fait** :
- `DraftState` et `DraftLine` portent le plafond (`capPct`), la remise saisie et la remise accordée par ligne, le client et la remise sur le total ; nouvelles actions `setDiscount`, `setOrderDiscount` et `setClient`.
- `DraftTable.tsx` calcule le tableau avec `computeQuote` (T-031) : colonnes N°, Désignation, Quantité, Unité, PU, Remise, Montant net ; pied avec total brut, total des remises, net à payer.
- Libellés ajoutés dans `labels.ts`.

**Décisions** : plafond de ligne à `0` en attendant la résolution des plafonds (RG-REM-01).

**Reste** : client, saisie des remises, enregistrement, PDF.

## 26/09/2026 — T-017b identité visuelle « Lamba » et T-085 nom de l'application — agent : Claude Code (Opus 5.5) ; commit par Gemini 3.1 Pro

Entrée écrite après coup par Claude Code : le travail a été commité par Google Gravity (`8a6128c`) pendant la pause.

**Fait** :
- **T-017b** : l'utilisateur choisit la direction C « Lamba » (ADR-0005), avec des pastilles d'initiales d'une couleur par rôle.
  - Jetons de couleur et de texte dans `index.css` ; cadre coloré par espace de travail avec une seule ligne d'état (`Frame`, `StatusLineProvider`) ; pavé, feuille, boutons et icônes partagés (`src/ui/`).
  - Connexion refaite : tuiles d'utilisateurs, saisie du PIN et mot de passe.
  - Devis allégé : les catégories s'ouvrent dans une feuille (autant qu'en compte le magasin), le pavé prend la place des résultats, le total reste visible.
  - Galerie de démonstration `/__design`, en développement seulement (absente de la version construite). Ses catégories et articles (`src/dev/fixtures.ts`) sont des exemples : les vrais viennent de la base.
- **T-085** : le nom par défaut est dans `packages/shared/src/brand.json`, et les règles du nom sont dans `brand.ts` (6 tests).
  - La commande `pnpm dist --nom "…" [--nom-court "…"]` construit `Dist/<nom-simplifié>/web/` et `nom.json`.
  - L'API lit `APP_NAME` (même défaut, refusée au démarrage si le nom est invalide) comme émetteur TOTP.
- CDC métier v0.6 (RG-DEV-06 précisée, RG-APP-01, ⚠️ H25), CDC technique §7, ADR-0005 et ADR-0006, glossaire (5 termes).

**Décisions** :
- Deux dépendances ajoutées : `@fontsource/asap` et `@fontsource-variable/archivo` (^5.3.0).
  - Polices auto-hébergées : la PWA doit s'afficher sans Internet, sur le seul réseau du magasin (ADR-0001), donc pas de Google Fonts.
  - Sous-ensemble latin seulement.
- Le nom par défaut vit dans `@vente-web/shared` : l'API, Vite et le script de distribution le lisent au même endroit.

**Questions ouvertes** :
- `APP_NAME` n'est pas documentée dans `.env.example`, que l'agent n'a pas le droit de modifier : à ajouter par l'utilisateur (`APP_NAME=Vente Web`, facultative).
- H25 à confirmer.

**Reste** : passage d'`APP_NAME` par Docker Compose avec T-080.

## 25/09/2026 — T-031 moteur de remises (ligne et total, % ou montant) — agent : Claude Code (Opus 5.5)

**Fait** :
- **Moteur** `packages/shared/src/discount.ts`, pur et sans flottant (calcul exact en centimes) :
  - `computeQuote` calcule le tableau du devis (RG-DEV-05) : brut, remise (montant et %), net par ligne ; total brut, remises des lignes, sous-total, remise sur le total, total des remises, net à payer.
  - Il indique pour chaque ligne et pour le total le **maximum autorisé** (à afficher avant toute saisie, RG-REM-02) et si la saisie le respecte.
  - Remise de ligne en **%** ou en **montant** : le plafond de la ligne (RG-REM-01) est converti en montant comme un % saisi ; une ligne à plafond 0 n'est remisable que par un code du boss (`granted`), qui remplace alors le plafond.
  - Remise sur le total en % ou en montant, bornée sans code par la **marge restante** (plafond × brut − remise de la ligne, jamais négative) et répartie au prorata de cette marge. Avec un code couvrant le total, la répartition se fait au prorata des nets (⚠️ H23).
  - `discountEntrySchema` (zod) valide une saisie : taux ≤ 100 % à 2 décimales, montant à 2 décimales ; `discountAmount` et `discountRate` servent à l'affichage.
- **Base** (migration `add_order_discount`) : colonnes `orders.order_discount_pct`, `order_discount_amount`, `order_discount_source`, `order_discount_code_id` (clé vers `discount_codes`) et `order_lines.order_discount_share`.
  - Le dossier généré (10 h 00) aurait été rangé avant `add_product_search` (12 h 00) : il est renommé `20260925130000_…` pour garder l'ordre.
- **Tests** : 14 nouveaux, dont un test sur 200 devis tirés au hasard (graine fixe) : la somme des parts égale toujours la remise sur le total, et aucun produit ne dépasse son plafond. Au total, 235 tests verts. `format:check`, `lint`, `typecheck` et `build` sont verts.

**Décisions** :
- **Précision de RG-REM-06** (CDC métier modifié d'abord) : la répartition suit la méthode du **plus fort reste**.
  - Chaque part est arrondie au centime inférieur, puis les centimes manquants vont aux plus grands restes.
  - La règle écrite, « écart porté par la plus grande part », peut rendre une part négative : 4 lignes égales et 0,02 MGA de remise donnent 4 × 0,01 et un écart de −0,02 sur une ligne.
  - Même résultat dans les cas courants ; le sens métier est inchangé.
- Le montant maximal d'une ligne est son plafond en % converti comme une saisie en %, arrondi au demi-supérieur. Ainsi « 5 % » et le montant affiché sont toujours acceptés tous les deux.
- La marge d'une ligne remisée par code au-delà de son plafond vaut 0 (jamais négative) : cette ligne ne prend aucune part de la remise sur le total, et les autres lignes gardent leur marge.
- Aucune dépendance ajoutée.

**Questions ouvertes** : inchangées (H20, H23, H24 ; H14–H17, H19, H21).

**Reste** : T-030 devis (client, enregistrement, colonne Remise, remise sur le total à l'écran, PDF) en s'appuyant sur `computeQuote` ; puis T-036 borne.

## 25/09/2026 — T-021 recherche rapide des articles (API + écran commercial) — agent : Claude Code (Opus 5.5)

**Fait** :
- **Base** (migration `catalog_search`) : extensions `pg_trgm` et `unaccent` ; colonne `products.search_text` (code + désignation, minuscules, sans accents) tenue à jour par triggers, y compris quand une unité change ; index trigramme.
- **API** :
  - `GET /products/search?q=` : mots dans n'importe quel ordre, début de mot, casse et accents ignorés ; ordre = correspondance exacte, puis codes commençant par la saisie, puis ressemblance ; 8 résultats au plus avec l'indicateur `more`. Un code ou un code-barres exact donne `exact` (le produit et l'unité scannée, sinon l'unité de base vendable) pour l'ajout direct.
  - Chaque résultat porte le disponible en unité de base (stock moins réservé), ses unités de vente avec prix en vigueur et plafond de remise (montré au commercial seulement).
  - `GET /products/favorites` : les 12 articles les plus présents dans les commandes du commercial sur 30 jours (hors brouillons et annulées). `GET /categories` : catégories actives.
- **Écran commercial** (`apps/web/src/sales/`) :
  - Un seul champ : code, code-barres ou désignation. Résultats pendant la frappe (dès 2 caractères, pause de 150 ms). **Entrée** ou un **scan** ajoute tout de suite l'article exact, avec un bip et une vibration. `12*SAV-001` ajoute 12 d'un coup.
  - **Douchette** Bluetooth/USB : une frappe hors champ est renvoyée dans la recherche. **Scan caméra en rafale** : un même code n'est recompté qu'après 1,2 s hors champ.
  - Sans saisie : **favoris** en un toucher et filtre par **catégorie**. Chaque unité de vente est un bouton (prix, disponible dans cette unité, remise max) : aucune liste déroulante, aucun défilement.
  - **Pavé de quantité** à grosses touches, ouvert après chaque ajout : la quantité s'affiche sélectionnée et la première touche la remplace ; il sert aussi à changer d'unité et à supprimer la ligne.
  - **Lignes en tableau** (N°, Désignation, Quantité, Unité avec équivalence, Prix unitaire, Montant, Total brut). Un même article dans la même unité s'ajoute à sa ligne. Brouillon en mémoire seulement : l'enregistrement arrive avec T-030, les remises avec T-031.
- **Partagé** : `decimal.ts` (quantités et montants en chaînes, calcul exact sans flottant : `lineGross`, `sumAmounts`, `addQuantities`, `isQuantity`), `parseQuickEntry`, `defaultSaleUnit`, `splitInUnit`, schémas zod de la recherche.
- **Outillage** :
  - `pnpm dev` de l'API corrigé : `tsx watch` doit précéder ses options, sinon Node cherchait un module `watch`.
  - `.claude/launch.json` lance l'API et la PWA dans l'aperçu du Code tab. L'API y tourne sans `watch`, car `tsx watch` reste bloqué quand l'entrée standard est un tube ouvert ; dans un terminal, `pnpm dev` fonctionne.
- **Tests** : 20 API (recherche, favoris), 18 partagés (décimaux, saisie rapide, unité par défaut) et 35 web (brouillon, pavé, filtre de scan, écran complet avec `fakeApi`). Au total, 221 tests verts. `format:check`, `lint`, `typecheck` et `build` sont verts. Parcours vérifié sur la base de démo : connexion, recherche par mots, code et code-barres, catégories.

**Décisions** :
- **Aucune dépendance ajoutée** : `pg_trgm` et `unaccent` sont livrées avec PostgreSQL ; le scan caméra utilise `BarcodeDetector`, natif dans Chrome Android.
  - Limite : absent sur iPad/Safari et Firefox, où l'écran le dit et renvoie à la douchette ou à la saisie.
  - Si les tablettes du magasin n'en disposent pas, une bibliothèque (ZXing) sera ajoutée et justifiée ici.
- Unité d'un ajout direct : celle du code-barres scanné ; sinon l'unité de base si elle a un prix, sinon la plus petite unité vendable.
- Favoris = articles du commercial lui-même, comptés en commandes et non en quantités, pour qu'un gros achat isolé ne les fausse pas.
- Le plafond de remise affiché est celui du commercial connecté ; le magasinier ne le voit pas.

**Questions ouvertes** : inchangées (H20, H23, H24 ; H14–H17, H19, H21).

**Reste** :
- Essayer le scan caméra sur une vraie tablette (Chrome Android) : impossible à tester ici.
- Puis T-031 moteur de remises, T-030 devis (enregistrement du brouillon), T-036 borne.

## 25/09/2026 — T-017 écran de connexion web et coquille par rôle — agent : Claude Code (Opus 5.5)

**Fait** (`apps/web` sauf mention) :
- **Client API** (`src/api/`) : `apiRequest` (JSON, cookie de session same-origin, codes d'erreur de l'API conservés, `NETWORK_ERROR` et `UNEXPECTED_RESPONSE` côté client), `parseResponse` (réponses validées par les schémas zod partagés), `authApi`, `errorMessage` (message français choisi par le code, jamais le texte du serveur ; durée du verrouillage arrondie à la minute supérieure, RG-USR-05).
- **Connexion** (`src/auth/`) :
  - En magasin : grille des noms (initiales, nom, rôles), puis clavier PIN à grosses touches ; clavier physique accepté (chiffres, Retour arrière, Entrée, Échap) pour la caisse. Choix du rôle seulement si l'utilisateur en a plusieurs (RG-USR-02). Lien « Connexion par mot de passe ».
  - Hors magasin (annuaire refusé `AUTH_LAN_ONLY`) : mot de passe + code TOTP, rôle Boss (par défaut) ou Administrateur (RG-USR-04).
  - Serveur injoignable : message et bouton « Réessayer ».
- **Session** : `AuthProvider` (session restaurée au chargement, connexion, déconnexion, changement de rôle sans nouvelle connexion) ; une session perdue (expirée, inactive, origine changée) ramène à l'écran de connexion avec la raison.
- **Verrouillage d'inactivité** (RG-USR-03) : `useIdleLock` mesure le temps écoulé (vérification toutes les 5 s et au retour de veille) ; au bout de `idleMinutes` (donné par le serveur : 5 min tablette, 15 min caisse), la session est **fermée côté serveur** et l'écran de connexion rouvre sur le même utilisateur et le même rôle : seul le PIN est redemandé.
- **Coquille** (`src/shell/`) : bandeau (nom, badge « À distance », rôle actif changeable, déconnexion) ; un espace de travail par rôle, vide en attendant les tâches suivantes.
- **Partagé** : `ROLE_LABELS` (libellés français des rôles, ADR-0004) dans `packages/shared`.
- **Tests** : 28 tests web (`fakeApi` : `fetch` simulé par route) — PIN, rôle requis, clavier physique, échec et verrouillage d'accès, mot de passe en magasin, accès distant + TOTP, réessai, restauration et changement de rôle, session perdue, déconnexion, maintien de session puis verrouillage d'inactivité (horloge simulée), crochet `useIdleLock` (réveil après le délai), rôles accessibles. `pnpm format:check`, `lint`, `typecheck`, `build` verts ; tests `shared` + `web` verts en local (Docker arrêté sur le poste : tests de l'API laissés à la CI, l'API n'a pas changé).

**Décisions** :
- **Aucune dépendance ajoutée** : ni routeur, ni TanStack Query, ni `user-event` ; `fetch` + contexte React suffisent tant qu'il n'y a qu'un écran par rôle. À revoir avec l'écran de vente (T-030).
- **Maintien de session** : toute activité à l'écran (toucher, touche, molette) envoie au plus un `GET /auth/me` par minute, pour que l'inactivité vue par le serveur (`last_seen_at`, écrit au plus une fois par minute) suive celle vue par l'écran. Un commercial qui lit un devis sans appeler l'API n'est donc pas déconnecté.
- **Verrou = déconnexion** : le verrouillage d'inactivité ferme la session au serveur (`POST /auth/logout`) au lieu de masquer l'écran ; le retour ne coûte que le PIN grâce à la présélection.
- Les rôles proposés dans le bandeau reprennent les règles de l'API (T-012) : pas de Boss/Administrateur depuis une session PIN, seulement eux à distance ; le serveur reste juge.

**Questions ouvertes** : inchangées (H20, H23, H24 ; H14–H17, H19, H21).

**Reste** : T-021 recherche rapide, puis T-031 moteur de remises, T-030 devis, T-036 borne.

## 25/09/2026 — Décisions de l'utilisateur (H22, remise sur le total et en montant, recherche rapide, borne libre-service) — CDC v0.5 — agent : Claude Code (Opus 5.5)

**Fait** :
- **CDC métier v0.5** (§16.4, décisions C3 bis à C6 et H22) :
  - **C3 bis** : colonne « Désignation » confirmée (RG-DEV-05).
  - **H22 — réponse A** : une demande au boss, et le code qui en découle, couvre une ou plusieurs lignes avec un % chacune ; le boss tranche ligne par ligne.
  - **C4 — remise en montant et sur le total** : RG-REM-06 réécrite en deux niveaux cumulables — remise de ligne (% ou montant) et remise sur le total (% ou montant, une par devis). RG-REM-02/03/04/07, RG-DEV-05 (totaux, calcul), RG-FAC-02 alignées.
  - **C5 — recherche rapide** : nouvelle **RG-DEV-06**. Recherche pendant la frappe côté serveur, ajout direct sur code exact ou code-barres, syntaxe `12*CODE`, favoris, scan caméra en rafale, lecteurs Bluetooth/USB ; jamais de défilement manuel.
  - **C6 — le client commande lui-même** : nouvelle **§5.10 borne libre-service** (RG-BOR-01 à 06). Le panier devient un devis repris par un commercial, qui seul valide ; pas de remise ni de données client à la borne.
- **CDC technique**, **glossaire**, `CLAUDE.md` et commentaires du schéma Prisma (`discount_requests`, `discount_codes`) alignés ; aucune migration à ce stade (colonnes créées par T-031, T-033, T-034, T-036).
- **Backlog** : T-017 (écran de connexion) créée et en cours ; T-021, T-030, T-031, T-033, T-034 précisées ; T-036 (borne) créée.

**Décisions** (déléguées par l'utilisateur, à confirmer) :
- **Recherche** : `pg_trgm` + `unaccent` dans PostgreSQL (extensions livrées avec PostgreSQL, aucune dépendance npm) ; scan caméra par l'API `BarcodeDetector` du navigateur (Chrome Android), une bibliothèque JS n'étant ajoutée — et justifiée ici — que si les tablettes ne la proposent pas.
- **Remise sur le total** ⚠️ H23 : sans code, bornée par la marge de remise restante des lignes, pour qu'aucun produit ne dépasse son plafond ; répartie sur les lignes au prorata de cette marge.
- **Borne** ⚠️ H24 : dans le lot MVP, en dernière tâche de la vente.

**Questions ouvertes** : H23 (règle de plafond de la remise sur le total), H24 (borne en MVP ou en V1.1), H20 (qui pose le mot de passe du `owner`, avant T-016) ; H14–H17, H19, H21 inchangées.

**Reste** : T-017 écran de connexion (en cours), puis T-021 recherche, T-031 moteur de remises, T-030 devis, T-036 borne.

## 23/09/2026 — Corrections métier de l'utilisateur (remise par ligne, MGA, devis en tableau) ; git simplifié — agent : Claude Code (Opus 5.5)

L'utilisateur a relu la première maquette de l'écran de vente et le fonctionnement git.

**Fait** :
- **Git** : T-010, T-011 et T-012 réunis sur `main` (commit `99e5f8a`), PR #1 et #2 fusionnées, branches supprimées. Désormais tout se fait sur `main`, sans branche ni PR ; l'agent committe et pousse sans solliciter l'utilisateur. Dernière ligne des messages de commit : `Powered by Claude Opus` (« tu n'es pas un auteur, tu es le moteur »). `CLAUDE.md`, CDC agent IA (§3.3, §4, §6.3, §7.4, §8, §9) et commandes `/debut-session`, `/fin-session` mis à jour.
- **CDC métier v0.4** (§16.3, corrections C1–C3) :
  - **C1 — remise par ligne** : la remise se fait produit par produit, jamais sur le total du devis ; RG-REM-06 réécrite (plus de remise globale répartie au prorata), §5.3, entités, RG-REM-03/04/07 alignées. Le modèle de données (`order_lines.discount_*`, `orders.discount_total` = somme) était déjà par ligne ; seul le commentaire de `discount_requests.line_id` (« null = globale ») est corrigé.
  - **C2 — devise** : sigle **MGA** après le montant (`1 250 000,00 MGA`), « Ariary » en toutes lettres, « Ar » jamais (non officiel) ; RG-FMT-01/04, RG-ART-06/07, glossaire, `CLAUDE.md` ; code : `formatMga` et ses tests.
  - **C3 — devis en tableau** : nouvelle **RG-DEV-05** (N°, Désignation, Quantité, Unité avec équivalence en unité de base, Prix unitaire, Remise % et montant, Montant net ; totaux dessous), valable pour devis, commande et facture, à l'écran comme sur le PDF. L'exemple « Rubrique / Nombre / Unité » de l'utilisateur est rendu par les termes usuels.
- **Backlog** : T-010/011/012 terminées ; T-011b (écarts du schéma à reporter au CDC technique) ; T-030, T-031, T-033, T-034 précisées.
- **Résultats** : voir le commit (`pnpm check` et `pnpm build` avant de pousser).

**Décisions** : remise par ligne, MGA/Ariary, présentation en tableau — décisions de l'utilisateur, consignées au CDC (§16.3).

**Questions ouvertes** :
- **H22** : une demande de remise au boss (et son code) couvre une ou plusieurs lignes, chacune avec son propre % ; le boss tranche ligne par ligne ; un code sans demande nomme le client, les articles et le % de chacun. Alternative : un seul % pour toutes les lignes désignées. À trancher avant T-033/T-034 (le schéma actuel ne porte qu'un % par demande et par code).
- H20 (qui peut poser le mot de passe du `owner`) reste ouverte, à trancher avant T-016.

**Reste** : maquette de l'écran de vente à refaire avec le tableau (fait dans la conversation, pas encore dans l'appli) ; prochaine tâche proposée : écran de connexion, puis catalogue, puis écran de vente.

## 22/09/2026 — T-012 authentification : PIN, mot de passe, TOTP, sessions, verrouillage — agent : Claude Code (Opus 5)

Branche `feat/T-012-auth`, **empilée** sur `feat/T-010-scaffolding` (PR #1 encore ouverte, CI verte). Conception d'abord (note de design v2 en deux passes de critique sécurité / conformité / simplicité), puis code, tests, revue adversariale multi-agents (27 constats, voir plus bas), correctifs, docs. Interrompu trois fois par la limite de session.

**Fait** (tout sous `apps/api` sauf mention) :
- **Partagé** : `packages/shared/src/auth.ts` (rôles, `OPERATIONAL_ROLES`, `ACCESS_ORIGINS`, schémas zod des corps de requête, `AuthMe`), `error-labels.ts` (libellés FR par code d'erreur, ADR-0004 : aucun français dans la logique) ; `zod` devient dépendance de `shared`.
- **Schéma** (migration `20260922100000_add_auth_columns`) : `users` + `totp_pending_secret`, `totp_enabled_at`, `totp_last_step`, `failed_login_count`, `last_failed_at`, `locked_until` (+ CHECK) ; `sessions` + `token_hash` (unique), `auth_method` (enum `PIN | PASSWORD | PASSWORD_TOTP`), `last_seen_at` ; les sessions existantes sont purgées par la migration (aucune n'était valide sans jeton).
- **Services** (`src/services/`) : `password-hash` (argon2id m = 19 456, t = 2, p = 1 ; hachage factice pour les comptes inconnus), `totp` (RFC 6238, fenêtre ±1, anti-rejeu par pas de temps), `trusted-proxy` + `access-origin` (origine **fail-closed**), `lockout` (`reserveLoginAttempt` : réservation **atomique** d'un créneau avant toute vérification, compteur remis à zéro après 15 min sans échec sur l'horloge de la base, verrou 15 min posé à la 5ᵉ réservation ; `releaseLoginAttempt` : un code TOTP juste seul rend son créneau ; `unspentTotpStep` : réclamation conditionnelle du pas TOTP), `login` (nom inconnu → journal applicatif avec `usernameDigest`), `sessions` (jeton 32 octets → sha256 ; expiration absolue et d'inactivité par type de poste avec une tolérance `TOUCH_INTERVAL_MS` = 1 min, cache des paramètres 60 s ; **toute fin de session est journalisée** avec sa raison), `switch-role`, `credentials` (PIN et mot de passe, libre-service + admin), `totp-enrolment` (démarrage et confirmation), `actor` (qui agit, pour l'audit), `settings`, `audit` (refuse toute valeur de secret dans `before`/`after`).
- **Plugins** (`src/plugins/`) : `db`, `access-origin`, `csrf` (fail-closed : `Sec-Fetch-Site` ou `Origin` = notre hôte), `session` (`request.auth`, `requireAuth`, `requireRole` — remplacés par le module de permissions en T-013). `src/errors.ts` : `AppError`, gestionnaire `{code, message, details}` ; zod → `VALIDATION_ERROR` sans écho de l'entrée ; en-têtes `Cookie`/`Authorization`/`Set-Cookie` masqués dans pino.
- **Routes** (`/api/v1`) : `auth/login`, `auth/me`, `auth/logout`, `auth/logout-all`, `auth/switch-role`, `auth/users` (annuaire pour l'écran de connexion, LAN seulement), `auth/pin`, `auth/password`, `auth/totp`, `auth/totp/confirm` ; admin `users/:id/{pin,password,unlock,totp,sessions}` ; limitation de débit `${origine}:${ip}` (10/min à distance, 60/min LAN, un compartiment mémoire par route) sur login, annuaire et toutes les routes libre-service qui reçoivent un secret ou un code.
- **Env** : `AUTH_SESSION_HOURS` (12), `AUTH_DEFAULT_ORIGIN` (défaut `LAN` hors production, s'applique à toute requête sans en-tête ; refusée en production), `COOKIE_SECURE` (défaut = production → cookie `__Host-vw_session`), `TRUST_PROXY` (IP/CIDR, défaut `127.0.0.1,::1`) ; une variable vide vaut non définie.
- **Base** : `createDb` force `TimeZone=UTC` sur chaque connexion (`@prisma/adapter-pg`, option `-c TimeZone=UTC`). Trouvé par un test rouge : Prisma lit et écrit les horodatages sans décalage alors que le conteneur tourne en `Indian/Antananarivo` ; un `locked_until` posé par Prisma était 3 h dans le passé pour `now()` en SQL brut, et le verrou ne tenait pas. Test de non-régression sur l'horloge de la base.
- **Seed** : PIN `1234` pour les comptes opérationnels, `Admin-1234!` / `Boss-1234!` + TOTP activé (secret fixe `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`) pour admin/boss ; un compte déjà présent **sans aucun secret** reçoit ceux de la démo, un secret modifié n'est jamais touché. Vérifié trois fois de suite sur la base de dev.
- **Tests** : harnais d'intégration sur une base `<db>_test` créée et migrée par `test/global-setup.ts` (`fileParallelism: false`) ; `test/auth-login`, `auth-session`, `auth-switch-role`, `auth-lockout`, `auth-credentials`, `users-admin` (53 scénarios : shape/origine, oracle générique, verrouillage — levée après délai, fenêtre glissante, 5ᵉ secret juste, course de 8 requêtes, 30 réservations concurrentes, dissimulation à distance, horloge de la base —, rejeu TOTP y compris en course, poste, CSRF, débit par route et par adresse, expiration absolue/inactivité et sa tolérance, paramètre tablette, `last_seen_at`, origine réévaluée, compte désactivé, rôle retiré, changement de rôle, annuaire, cookie `__Host-` aller-retour, libre-service et fermeture des autres sessions, enrôlement et ré-enrôlement TOTP, admin) ; unitaires sans base `src/**/*.test.ts` (44 : env dont valeurs vides et production, argon2, TOTP, CSRF, proxies de confiance/origine, règles de forme de la connexion, poste ↔ rôle, changement de rôle, audit). `tsconfig.test.json` typecheck les tests (a attrapé une erreur de typage dans les helpers).
- **Résultats** : `pnpm lint` ✅ · `pnpm format:check` ✅ · `pnpm typecheck` ✅ (3 paquets + tests) · `pnpm test` ✅ **111 tests / 17 fichiers** (≈ 27 s) · `pnpm build` ✅ (aucun test émis dans `dist/`). Après la vérification finale (voir plus bas) : `pnpm test` ✅ **120 tests / 17 fichiers**, intégration comprise (le 23/09, après le redémarrage de Docker Desktop : deux passages consécutifs verts, ≈ 30 à 65 s). Fichiers tous < 400 lignes (max : `test/auth-login.test.ts` 328).
- **Docs** : CDC métier §16.2 + **H19, H20, H21** ; CDC technique §2.2 (en-tête `x-access-origin`, `TRUST_PROXY`, fail-closed, variable vide, adresse client à travers le tunnel), §5 (lignes `users`, `sessions`, connexions UTC), §6 (routes et codes d'erreur `auth`), §8 (argon2, TOTP, sessions et leurs fins journalisées, réservation atomique, débit sur toutes les routes à secret, CSRF fail-closed à la place du jeton double soumission) ; backlog : T-012, **T-016** (comptes) ajoutée.
- **Revue adversariale** (Workflow : 5 lecteurs par dimension → vérification contradictoire) : 27 constats. **5 confirmés, tous corrigés** : oracle `AUTH_TOTP_NOT_ENROLLED` à distance (désormais 401 générique, 403 explicatif en LAN seulement) ; routes libre-service sans limitation de débit ; ré-enrôlement TOTP vérifié contre le dernier pas de l'*ancien* secret ; dépense du code TOTP non atomique (deux requêtes avec le même code pouvaient ouvrir deux sessions) ; expiration d'inactivité déclenchée 60 s trop tôt. **3 réfutés** : noms inconnus dans les journaux (haché malgré tout) ; clé de débit effondrée si le tunnel ne transmet pas l'adresse client (corollaire T-080, documenté) ; secrets de démo dans le seed (voulu, garde `NODE_ENV`). **1 requalifié en question** : l'admin peut poser un secret au `owner` (voir *Questions*). **18 non vérifiés**, presque tous traités quand même : levée du verrou et fenêtre glissante testées, compte désactivé, isolation des tests de débit, chaque fin de session journalisée, cookie `__Host-` aller-retour, changement de mot de passe qui ferme les autres sessions, verrou qui efface un enrôlement en attente, horloge unique (base), variable vide, `switchRole` en `updateMany`. Non retenus, documentés dans H19 : tentatives sur nom inconnu ou pendant un verrou hors `audit_log` ; rôle non détenu compté comme un échec.
- **Seconde revue adversariale** (sur le code corrigé) : 14 constats après dédoublonnage. **Corrigés** : l'enrôlement TOTP sans code passait pendant un verrou (désormais 423, `assertNotLocked` sous verrou de ligne) ; les sessions expirées balayées à la connexion n'étaient pas journalisées ; la confirmation TOTP était possible hors du magasin (LAN seulement, comme le démarrage) ; le CSRF ne comparait pas le schéma de l'`Origin` ; `COOKIE_SECURE=false` accepté en production (refusé) ; `AUTH_SESSION_HOURS` jusqu'à 720 (borné à 12) ; codes d'erreur `BAD_REQUEST`/`INTERNAL_ERROR` absents du CDC technique §6 ; condensé du nom inconnu en sha256 nu (HMAC à clé propre au processus) ; formulation de H20. **Réfuté** : hôte falsifié par `X-Forwarded-Host` (Fastify ne le croit que d'un pair de `TRUST_PROXY`). `credentials.ts` scindé (`actor.ts`, `totp-enrolment.ts`) pour rester sous 400 lignes.
- **Vérification finale** (4 agents sur le diff corrigé), chaque constat avec son correctif : un double `logout` journalisait deux fois (audit seulement par la requête qui supprime la ligne ; `logout-all` sans session restante n'écrit rien) ; un code TOTP juste relançait la fenêtre des échecs antérieurs (la réservation, désormais une transaction `SELECT … FOR UPDATE` puis `UPDATE`, retient `last_failed_at` d'avant, que `releaseLoginAttempt` remet si aucune tentative ne l'a déplacé depuis — comparaison par le compteur, l'horodatage `timestamptz` étant en µs et `Date` en ms) ; la « fenêtre glissante » est en fait chaînée (chaque échec la prolonge) : documentée dans H19 et testée ; la confirmation d'un ré-enrôlement TOTP laissait vivre les sessions distantes ouvertes avec l'ancien secret (fermées et journalisées, H20) ; les refus pour verrou en libre-service ne laissaient aucune trace (crochet `onError` → journal applicatif, testé comme celui de la connexion) ; le test de débit n'incluait pas `totp/confirm` ; `X-Forwarded-Proto` et l'hôte à transmettre par Caddy (CDC technique §2.2, T-080) ; H20 disait « PIN » pour tout compte (réservé aux rôles opérationnels). **Acceptées et documentées (H19)** : deux courses de quelques millisecondes autour de `releaseLoginAttempt` (verrou un échec plus tôt ; un échec effacé si une remise à zéro et un nouvel échec s'intercalent — il faut une session par mot de passe et le code TOTP courant). Tests ajoutés : fenêtre chaînée, TOTP rendu avec sa fenêtre, double `logout`, fermeture des sessions distantes au ré-enrôlement, journal applicatif des refus, `X-Forwarded-Proto` d'un pair de confiance ou non.

**Décisions techniques** (aucune ne contredit un ADR ; tout ce qui n'est pas dans le CDC est marqué H19–H21) :
- **Origine fail-closed** : l'en-tête n'est lu que depuis un pair de `TRUST_PROXY`, sinon `REMOTE` ; un client direct ne peut pas se faire passer pour le magasin. Corollaire pour **T-080** : Caddy pose `x-access-origin` sur ses deux écoutes en écrasant la valeur cliente, le port de l'API n'est jamais publié, `TRUST_PROXY` = adresse du conteneur Caddy, image **glibc** (binaire natif argon2).
- **Réponses génériques** : compte inconnu, inactif, rôle non détenu ou secret faux ⇒ même 401 ; exactement une vérification argon2 dans chaque chemin (hash factice) ; à distance, un compte verrouillé répond aussi 401 (le 423 `AUTH_LOCKED` avec `retryAfterSeconds` n'existe qu'en LAN). Le TOTP est exigé **dans la même requête** que le mot de passe à distance (règle de forme, avant toute lecture du compte : pas d'oracle sur le mot de passe) ; en LAN, un `totp` fourni est vérifié.
- **Sessions** : révocation = suppression de la ligne (pas de `revoked_at`, pas d'IP/user-agent : `audit_log` trace connexions/déconnexions) ; origine, compte, rôle et inactivité revérifiés à chaque requête ; une session LAN présentée depuis l'extérieur est détruite (`auth.origin_rejected`). Le changement de rôle vérifie aussi la compatibilité du poste.
- **CSRF** : la règle « `Sec-Fetch-Site` ou `Origin` = hôte, sinon refus » remplace le jeton double soumission du CDC (plus simple, sans état, portée par tous les navigateurs cibles) ; `URL.host` supprime le port par défaut, d'où une normalisation `:80`/`:443` côté `Host`.
- **Verrouillage** : le créneau est **réservé avant** la vérification (`UPDATE … WHERE locked_until IS NULL OR locked_until <= now() RETURNING`, horloge de la base seulement) : jamais plus de 5 vérifications par fenêtre, même sous une rafale concurrente ; le verrou est posé à la 5ᵉ réservation et un 5ᵉ secret juste le lève. Un mauvais secret courant en libre-service compte comme un échec de connexion (RG-USR-05) ; un changement de PIN ou de mot de passe ferme les **autres** sessions du compte, celle de l'appelant reste ; l'admin qui change son propre secret garde sa session ; un changement de TOTP ferme les sessions distantes du compte. Le pas TOTP est réclamé par une mise à jour conditionnelle (`totp_last_step < pas`) — à la connexion dans la même instruction que la remise à zéro du compteur, juste avant la transaction qui crée la session ; à l'enrôlement dans la transaction de l'audit : la requête perdante est un rejeu (`totp_replayed`). Un code TOTP juste seul (enrôlement) ne prouve ni PIN ni mot de passe : il rend son créneau au lieu de remettre le compteur à zéro.
- **Audit** : `auth.login_failed` / `auth.locked` portent `userId: null`, `entityType: 'user'`, `entityId: <compte>` (l'acteur n'est pas authentifié, la cible est le compte) ; les échecs sur un nom inconnu vont dans le log applicatif seulement (l'audit est immuable, RG-AUD-02 vise des comptes). Codes d'erreur ajoutés au fil de l'eau : `AUTH_TOTP_NOT_PENDING`, `PIN_REQUIRES_OPERATIONAL_ROLE`, `AUTH_REAUTH_REQUIRED`, `AUTH_ORIGIN_MISMATCH`, `AUTH_SESSION_IDLE`.
- `Algorithm` de `@node-rs/argon2` est un *const enum* ambiant, inutilisable sous `verbatimModuleSyntax` : littéral `2` (Argon2id) documenté. Prisma n'accepte pas `undefined` dans un champ JSON sous `exactOptionalPropertyTypes` : *spread* conditionnel des instantanés.

**Dépendances ajoutées (justification, 03 §3.2)** — prod : `@node-rs/argon2` 2.2 (argon2id figé par le CDC §8 ; binaires napi préconstruits, aucun script post-install ; Node 22 n'a pas d'argon2 natif), `otpauth` 9.5 (RFC 6238 pur JS, sans dépendance), `@fastify/cookie` 11 (cookie de session signé/parsé côté Fastify), `@fastify/rate-limit` 11 (limitation par clé personnalisée, réponse d'erreur au format maison), `fastify-plugin` 6 (plugins qui décorent `request`/`app` sans encapsulation — indispensable pour `request.auth`), `zod` dans `shared` (les schémas des corps de requête y vivent, consommés par l'API et bientôt par la PWA). Écartés : `@fastify/csrf-protection` (jeton avec état alors que `Sec-Fetch-Site`/`Origin` suffisent), `@fastify/session` (stockage de session maison exigé par le CDC), `speakeasy` (non maintenu).

**Reste** :
- `Source/.env.example` ✅ : les quatre variables ajoutées par l'utilisateur le 23/09 (l'agent ne peut pas le lire, règle `deny Read(**/.env.*)`) ; contenu collé dans la conversation et validé par `loadEnv` : accepté en développement, refusé en production (`AUTH_DEFAULT_ORIGIN`, `COOKIE_SECURE=false`) comme prévu.
- **Utilisateur** : fusionner la PR #1, puis rebaser `feat/T-012-auth` sur `main` (la PR **#2** T-012 est ouverte sur `main` et inclut donc T-010/T-011 tant que la PR #1 n'est pas fusionnée).
- Purge périodique des sessions expirées des comptes qui ne se reconnectent jamais (aujourd'hui balayées à la connexion suivante ou à la présentation du cookie) : tâche planifiée, avec audit.
- Si les courses acceptées de `releaseLoginAttempt` deviennent un sujet : colonne d'époque sur `users` pour rendre la restitution exacte.
- **T-016** (nouvelle, avant T-080) : CRUD des comptes sans suppression (RG-USR-06), désactivation et changement de rôles qui ferment les sessions, `password_change_required`, `admin:bootstrap`.
- **T-080** : voir corollaire ci-dessus ; envisager Cloudflare Access devant le tunnel (un attaquant distant peut sinon verrouiller le boss 15 min en boucle).
- **T-081** : poivre (pepper) des PIN et chiffrement au repos des secrets TOTP avec les sauvegardes ; **T-013** remplace `requireRole` par le module de permissions de l'annexe B ; **T-015** rend le poste obligatoire à la connexion (H21).
- Suivi inchangé : T-010b, T-010c, H14–H17, écarts T-011 à reporter dans le CDC technique §5.

**Questions** :
- ⚠️ H20 : l'admin peut-il réinitialiser le mot de passe du compte `owner` (boss) ? Aujourd'hui oui (modèle de confiance, chaque changement journalisé et visible du boss). Alternative : le boss seul change son mot de passe, et un boss qui l'a oublié passe par une procédure hors application (commande serveur, T-016 `admin:bootstrap`). À trancher par l'utilisateur.

## 22/09/2026 — T-011 schéma Prisma, migration initiale, seed de démonstration — agent : Claude Code (Opus 5)

Travail mené sur `feat/T-010-scaffolding` à la suite de T-010 (« on fera PR plus tard »), à travers deux crashs du PC (aucune perte : tout est sur disque). Fin de session : l'utilisateur déclenche la création de la PR ; les deux tâches partent en **deux commits** sur la même branche.

**Fait** :
- `apps/api/prisma/schema/` — schéma **multi-fichiers** (`schema.prisma` générateur + datasource ; `users`, `catalog`, `stock`, `sales`, `payments`, `system`), conforme au CDC technique §5 : UUID v7, `Decimal(14,2)` montants, `Decimal(12,2)` quantités en unité de base, `Decimal(12,3)` facteurs, `Timestamptz`, `snake_case` via `@map`. 27 modèles, 15 enums.
- `prisma.config.ts` (Prisma 7 : plus de `url` dans le schéma, plus de chargement automatique de `.env`) : lit `Source/.env` via `dotenv` ; la datasource n'est déclarée que si la commande se connecte, pour que `prisma generate` (donc `pnpm typecheck` et la CI) marche sans base.
- Client généré dans `apps/api/src/generated/prisma/` (ignoré par git, ESLint, Prettier) ; `src/db.ts` (`createDb(url)` avec `@prisma/adapter-pg`) ; `env.ts` exige `DATABASE_URL` postgres (test ajouté, ADR-0001).
- Migration `20260921154803_init` = DDL généré par Prisma **+ bloc SQL manuel** (ce que Prisma n'exprime pas) : index uniques partiels (lettre de ticket par commercial actif, un seul écran actif, une unité de base par article, un seul prix courant par unité, téléphone client actif, une demande de remise en attente par commande, une session de caisse ouverte par caissier), index `lower(sku)` / `lower(username)`, contraintes CHECK (facteur > 0, base = 1, `base_qty = round(qty × factor, 2)`, stock ≥ 0 et réservé ≤ en stock, plafonds 0–100, code de remise % **ou** montant…), **triggers d'immuabilité** : `audit_log`, `stock_movements`, `payments`, `payment_lines` en ajout seul ; `product_prices` modifiable uniquement pour clôturer `effective_to` (RG-ART-07) ; `invoices` figées sauf `status`/`pdf_path` (RG-FAC-01) ; `credit_notes` figés sauf `pdf_path` ; `product_units.factor` gelé dès qu'une ligne de commande l'utilise (RG-ART-06). Vérifié à la main : chaque écriture interdite lève bien l'erreur.
- Seed `prisma/seed.ts` + `seed/data.ts` + `seed/catalog.ts` (**idempotent**, refusé si `NODE_ENV=production`) : 21 paramètres (§13), 7 moyens de paiement (RG-PAY-01), 8 comptes (un par rôle, deux commerciaux A/B, **sans identifiants** : T-012), 7 postes, 4 catégories, 9 articles / 18 unités de vente (dont l'exemple SAV-001 pièce ×1 / paquet ×6 / carton ×72 de RG-ART-06) avec prix `source = IMPORT` rattachés à un lot d'import COMMITTED et stock d'ouverture passé par `stock_movements` (comme un vrai import), 5 clients.
- CI : service PostgreSQL 16 ; `db:deploy` puis **seed exécuté deux fois** (preuve d'idempotence) avant les tests.
- **Résultats** : `prisma migrate dev` ✅ (« Already in sync » au second passage) · seed ×2 ✅ · `pnpm check` ✅ (lint, typecheck 3 paquets, 17 tests, Prettier) · `pnpm build` ✅.

**Décisions techniques** (aucune ne contredit un ADR) :
- **Port hôte 5433** pour le PostgreSQL de dev (`POSTGRES_PORT`, défaut compose) : la machine a un PostgreSQL 18 natif sur 5432 qui interceptait la connexion (`P1010`). ⚠️ `Source/.env.example` dit encore 5432 : l'agent ne peut pas l'éditer (règle `deny Read(**/.env.*)` de `.claude/settings.json`) → **à corriger par l'utilisateur** (ou restreindre la règle à `.env` seul).
- Écarts au modèle du CDC technique §5, à reporter dans le CDC (T-011 suite, ou au fil de l'eau) : `discount_requests.discount_code_id` supprimé au profit de `discount_codes.request_id` unique (une seule direction pour le lien 1-1) ; `order_lines.position` ajouté (ordre d'affichage stable) ; `order_lines.product_price_id` nullable tant que la commande est DRAFT ; `reservations.closed_at` ajouté ; `audit_log` **non partitionné** pour l'instant (volume MVP faible, partition mensuelle = tâche ultérieure) ; retrait des droits SQL UPDATE/DELETE au rôle applicatif reporté à T-014/T-080 (les triggers protègent déjà quel que soit le rôle).
- Le seed enregistre prix et stock **via un lot d'import** plutôt que par écriture directe : même chemin que la production, et les triggers d'ajout seul restent respectés.
- Docker Desktop : après un crash, des sockets corrompus dans `%LOCALAPPDATA%\Docker\run\` et `%LOCALAPPDATA%\docker-secrets-engine\` empêchent le démarrage (« The file cannot be accessed by the system », suppression impossible) ; remède : renommer ces dossiers en `*.broken-<date>`, recréer des dossiers vides, `wsl --shutdown`, relancer Docker Desktop.

**Dépendances ajoutées (justification, 03 §3.2)** — prod : `@prisma/client` 7.10 (ORM figé par ADR-0003 ; la 8.0 est encore en RC), `@prisma/adapter-pg` + `pg` 8.23 (Prisma 7 n'embarque plus de moteur : le pilote est le client `pg` officiel) ; dev : `prisma` 7.10 (CLI migrations/génération), `@types/pg`, `dotenv` 18 (uniquement pour `prisma.config.ts` et le seed, Prisma 7 ne charge plus `.env` ; l'API elle-même utilise `--env-file-if-exists` de Node).

**Reste** : PR `feat/T-010-scaffolding` → `main` (T-010 + T-011) ; `.env.example` → 5433 (utilisateur) ; reporter les écarts ci-dessus dans le CDC technique §5 ; T-012 ensuite. Suivi inchangé : T-010b, T-010c, H14–H17.

## 21/09/2026 (suite 3) — **GO donné le 21/09/2026** — T-010 scaffolding — agent : Claude Code (Opus 5)

**GO pour coder donné par l'utilisateur le 21/09/2026** (message : « Go pour le codage maintenant »). Fin de la phase spécification ; `CLAUDE.md` mis à jour. Points H14–H17 non tranchés : on code selon les hypothèses écrites (⚠️ maintenues dans le CDC métier), à confirmer.

**Fait** : commit `3e5bb0b` (CDC v0.3) poussé par l'utilisateur. Branche `feat/T-010-scaffolding` créée ; T-010 en cours (voir point d'étape ci-dessous). `CLAUDE.md` : section statut, stack et interdits réécrits pour l'après-GO ; backlog T-008 → Fait.

**Point d'étape T-010 (16 h, après un crash du PC — tous les fichiers ont survécu)** — scaffolding `Source/` conforme au CDC technique §4 :
- Racine : `package.json` (privé, `packageManager` pnpm 12.5.1, `engines` Node ≥ 22.12, scripts `dev/build/lint/typecheck/test/format/check/db:*`), `pnpm-workspace.yaml` (+ `allowBuilds: esbuild`, pnpm 12 bloque les scripts post-install par défaut), `.npmrc`, `.env.example`, `vitest.config.ts` (projets `shared`, `api`, `web`), `eslint.config.js`, `prettier.config.js`.
- `packages/config` : `tsconfig.base.json` (strict, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), ESLint flat (`eslint.js` — pas `eslint.config.js`, sinon ESLint 10 le prend pour une config locale vide), Prettier.
- `packages/shared` : `formatMga`, `formatQty`, `roundHalfUp` (arrondi demi-supérieur exact en arithmétique entière, `1.005 → 1.01`) — 10 tests citant RG-FMT-01 / RG-ART-04.
- `apps/api` : Fastify 5, `buildApp()` testable par `inject`, `env.ts` validé par zod, `GET /healthz` (CDC §10.5) — 3 tests ; démarrage réel vérifié (`{"status":"ok","version":"0.1.0"}`).
- `apps/web` : React 19 + Vite 8 + `vite-plugin-pwa` (manifeste FR, `/api` et `/socket.io` jamais servis par le cache) + Tailwind v4 ; libellés FR dans `labels.ts` ; 2 tests (jsdom + Testing Library) dont un sur l'espace insécable de RG-FMT-01.
- `infra/docker-compose.yml` : PostgreSQL 16 de dev uniquement (prod : T-080). `.github/workflows/ci.yml` : install → lint → format → typecheck → test → build. `.claude/` : commandes `debut-session`, `fin-session`, `adr` ; `settings.json` (allow `pnpm …`, `docker compose …`, `git status/diff/log` ; deny `.env`, `push --force`, `reset --hard`, `rm -rf`). `Source/CLAUDE.md` (27 lignes).
- **Résultats** : `pnpm lint` ✅ · `pnpm typecheck` ✅ (3 paquets) · `pnpm test` ✅ 16/16 · `pnpm build` ✅ (web 221 kB, SW généré) · `pnpm format:check` ✅.

**Décisions techniques** (pas d'ADR : elles ne contredisent aucun ADR, versions seulement) :
- **React 19** au lieu de 18 (CDC technique §3 mis à jour) : version stable courante, exigée par `@vitejs/plugin-react` 6 / Vite 8 ; aucune raison de démarrer sur une majeure en fin de vie.
- **TypeScript 5.9** (pas 7.x) : `typescript-eslint` n'accepte pas encore TS ≥ 6.1 ; à réévaluer quand l'écosystème suit.
- `@types/node` 22 dans l'API pour coller à la cible de production (Node 22 LTS), même si la machine de dev a Node 24.
- pnpm sans installation globale : shim corepack dans `%APPDATA%\npm` (pas de droits admin sur `Program Files`) ; la version reste pilotée par `packageManager`.
- Husky **non installé** : la racine git (`Vente WEB/`) n'est pas `Source/` ; un hook s'installe mal depuis un sous-dossier. La CI joue le rôle de garde-fou ; à revoir si besoin (tâche T-010b).

**Dépendances ajoutées (justification, 03 §3.2)** — prod : `fastify` 5.12 (figé ADR-0003), `zod` 4.6 (schémas partagés, validation env), `react`/`react-dom` 19.3 ; dev : `typescript` 5.9, `vitest` 5 (+ `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` pour le front), `vite` 8 + `@vitejs/plugin-react` 6 + `vite-plugin-pwa` 1.3 (SW/manifeste, ADR-0002), `tailwindcss` 4 + `@tailwindcss/vite` (sans PostCSS), `eslint` 10 + `@eslint/js` + `typescript-eslint` 8 + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` + `eslint-config-prettier` + `globals`, `prettier` 3.9, `tsx` (exécution TS en dev sans build), `pino-pretty` (logs lisibles en dev seulement ; pino est fourni par Fastify), `@types/node`, `@types/react`, `@types/react-dom`. Écartés : Husky (voir ci-dessus), shadcn/ui (à initialiser avec le premier écran, T-021/T-030), Prisma (T-011), Socket.IO (T-032/T-040), Playwright (T-083).

**Reste** : commit + push + PR par l'utilisateur (commandes fournies) ; T-011 ensuite. Suivi : T-010b (Husky ou équivalent), icônes PNG 192/512 depuis le logo de `Autres/` (T-010c).

## 21/09/2026 (suite 2) — Grille de prix par unité, historique des prix, ADR acceptés — CDC v0.3 — agent : Claude Code (Opus 5)

**Fait** : à la demande de l'utilisateur (« un tableau de prix pour les articles par unité de comptage », « gestion de l'historique et de son évolution »), CDC métier et technique passés en **v0.3** ; glossaire et backlog alignés.

**Décisions de l'utilisateur** (H18, CDC métier §16.1) :
- Un article est stocké dans une **unité de base** et vendu dans **une ou plusieurs unités de vente** (pièce, paquet, carton…), chacune avec un **facteur** de conversion et **son prix** ; un seul stock par article, en unité de base (RG-ART-06).
- Import : **une ligne par couple article × unité** ; la quantité de chaque ligne est convertie en unité de base (RG-IMP-01/02/03, annexe A réécrite avec exemple).
- Plafond de remise par article, **surcharge possible par unité de vente** (RG-REM-01).
- **Historique des prix** : un prix n'est jamais écrasé ; nouveau prix daté (date d'effet), ancien clôturé ; fiche article avec tableau et courbe d'évolution ; export ; les lignes de commande référencent le prix historisé (RG-ART-07, RG-CMD-04). Date d'effet future : [V1.1].
- **ADR 0001 à 0004 acceptés** (statut mis à jour dans chaque fichier, ligne « Statut » uniquement).

**Reste** : confirmer H14–H17 (H14 reformulée : un article sans aucune unité de vente à prix est non vendable) ; commit de la v0.3 sur accord. GO pour coder non donné.

## 21/09/2026 (suite) — Hypothèses tranchées, CDC v0.2 — agent : Claude Code (Opus 5)

**Fait** : l'utilisateur a répondu aux hypothèses H1–H13 et validé T1–T8. CDC métier passé en **v0.2** et CDC technique en **v0.2** ; glossaire et backlog alignés.

**Décisions de l'utilisateur** (détail : CDC métier §16.1) :
- H1 un seul magasin, **plusieurs magasiniers** et comptoirs (RG-USR-08).
- H2 lettre du ticket = commercial : OK.
- H3 réservation **sans limite dans la journée**, expiration en fin de journée (`day_end_time`).
- H4/H5 **le caissier ne valide plus aucune remise** : plafonds paramétrés d'avance (article → catégorie → paramètre, défaut 0 %) ; au-delà, **seul le boss** accorde, via un **code de remise unique** appliqué automatiquement à la facture et au paiement. Les politiques LIBRE/VALIDATION/INTERDIT et le plafond caissier 10 % sont supprimés.
- H6 sortie de stock à la livraison : OK ; le disponible déduit toutes les commandes validées non livrées (file caisse comprise).
- H7 article = code unique, catégorie, désignation, unité de comptage, quantité ; **quantités décimales** partout ; date d'importation tracée.
- H8 import en **quatre temps** : dépôt → visualisation → annulation possible → validation.
- H9, H10 : OK. H11 : **nombre libre** de tablettes, caisses, comptoirs ; 1 écran ou appel verbal ; paramétrable et modifiable (`stations`).
- H12 client **obligatoire** : nom + contact (téléphone).
- H13 boss : tableau de bord horaire/journalier/hebdo/mensuel ; notification des demandes de remise spéciale ; émission de codes.
- T1–T8 : OK (T7 devient « 0 ou 1 écran »).

**Reste** : confirmer H14–H17 (CDC métier §16.2 : prix facultatif dans l'import, qui fixe les plafonds, heure de fin de journée par défaut, rattachement automatique du code à la commande) ; ~~accepter les ADR 0001–0004~~ (fait, suite 2) ; commit de la v0.2 sur accord. GO pour coder non donné.

## 21/09/2026 — Création des cahiers des charges — agent : Claude Code (Opus 5)

**Fait** : dépôt git initialisé (aucun commit). Projet déplacé de `C:\Users\FUSZ\vente web` vers `F:\Documents\Programmation\Vente WEB` avec l'organisation demandée par l'utilisateur : `Source/` (code), `Dist/` (livrables, non versionné), `Docs/` (markdown), `Autres/` (documents fournis). Rédaction de `CLAUDE.md`, `AGENTS.md`, `Docs/README.md`, `Docs/glossaire.md`, `Docs/01-cdc-metier.md`, `Docs/02-cdc-technique.md`, `Docs/03-cdc-agent-ia.md`, ADR 0001 à 0004 (statut Proposé), `Docs/backlog.md`, ce journal.

Dépôt distant fourni par l'utilisateur : `https://github.com/Fusgith/vente_web.git` (vide), ajouté comme `origin` ; branche locale renommée `master` → `main`.

Premier commit `e8d73a1` poussé sur `origin/main` avec l'accord de l'utilisateur (T-007). Correctif à la suite : la règle `dist/` du `.gitignore` masquait `Dist/README.md` (git insensible à la casse sous Windows) → règle restreinte à `Source/**/dist/` ; ajout de `.gitattributes` (`eol=lf`) pour des fins de ligne stables entre Windows et les conteneurs Linux.

**Reste** : validation par l'utilisateur des hypothèses (H1–H13 métier, T1–T8 technique) et des ADR ; GO pour coder non donné.

**Décisions prises par l'utilisateur (dans la conversation)** :
- Plateforme web sans installation (PWA), accessible en Wi-Fi local et depuis l'extérieur pour le boss.
- Serveur local maître + tunnel + sauvegarde cloud (ADR-0001), à la place d'une synchronisation bidirectionnelle.
- Tous moyens de paiement, y compris mixte. Pas de gestion de trésorerie : le boss veut le total encaissé du jour et les quantités vendues.
- Pas de gestion de stock au sens achats : les entrées se font uniquement par import Excel.
- TVA optionnelle (paramètre), devise Ariary (MGA), format `1 250 000,00 Ar`.
- Six rôles fixes : admin, responsable, commercial, caissier, magasinier, boss.
- Organisation du dépôt en quatre dossiers : `Source/`, `Dist/`, `Docs/`, `Autres/`.
- L'admin corrige par écrans assistés journalisés, pas d'écriture directe en base ; remise à zéro uniquement avant mise en service (proposition du consultant, à confirmer).

**Questions ouvertes** : voir CDC métier §16 et CDC technique §13. Les plus structurantes : H1 (un seul magasin), H2 (lettre du ticket), H6 (sortie de stock à la livraison), T1/T6 (domaine et tunnel), H11 (nombre de postes).

**Prochain pas** : recueillir les réponses, mettre à jour les CDC (démarquer les hypothèses validées), passer les ADR en « Accepté », proposer le premier commit.

**GO pour coder** : non donné.
