# Journal de bord

Entrées en ordre antichronologique (la plus récente en tête). Gabarit : `03-cdc-agent-ia.md` §5.1.

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
