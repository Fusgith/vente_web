# Journal de bord

## 26/09/2026 — Sécurisation des travaux T-017b (Design Lamba) et T-085 (Nom de l'application) — agent : Gemini 3.1 Pro

**Fait** :
- **Reprise de session** : Claude Code avait terminé une grande partie de **T-017b** (Identité visuelle Lamba, refonte UI de l'écran de connexion et de vente) et de **T-085** (Nom de l'application fixe via \rand.json\, script de distribution, et ADR associés) mais la session s'était achevée sans commit.
- **Vérifications** : L'ensemble des 261 tests (incluant les composants UI \Frame\, \Keypad\, \AppShell\) sont passés avec succès. Les analyses statiques (\pnpm lint\, \	ypecheck\, \ormat:check\) sont au vert absolu.
- **Base documentaire** : Les documents \ADR-0005\ et \ADR-0006\ ont été créés et le backlog actualisé.
- **Commit et Push** : Tous les travaux en attente ont été commités et poussés sur \origin/main\ pour garantir la continuité (commit \8a6128c\).
- **Backlog** : T-017b et T-085 passent en \Terminé\.

**Décisions** :
- Intégration du design de la galerie \/__design\ et refonte des composants partagés (Sheet, Keypad, Icon) actée et stabilisée.
- Aucune régression introduite. 

**Questions ouvertes** : inchangées (H20, H23, H24 ; H14–H17, H19, H21).

**Reste** :
- T-030 Devis (client, enregistrement, colonne Remise, remise sur le total à l'écran, PDF).
Entrées en ordre antichronologique (la plus récente en tête). Gabarit : `03-cdc-agent-ia.md` §5.1.

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

