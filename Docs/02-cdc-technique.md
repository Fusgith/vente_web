# Cahier des charges TECHNIQUE — Vente Web

Version 0.3 — 21/09/2026 — Statut : **hypothèses T1–T8 validées, ADR 0001–0004 acceptés par l'utilisateur le 21/09/2026** ; modèle de données aligné sur le CDC métier v0.3 (unités de vente avec facteur, grille et historique des prix, remises par plafond + code du boss, import en quatre temps, client obligatoire, postes libres).

Ce document traduit le CDC métier en architecture, stack et règles d'implémentation. Les décisions structurantes sont figées par ADR (`adr/`). Les choix marqués « recommandé » peuvent être remplacés par un nouvel ADR ; les choix marqués « figé » ne le peuvent qu'avec l'accord explicite de l'utilisateur.

## 1. Principes directeurs

1. **Une seule vérité** : une base PostgreSQL maître sur le serveur du magasin. Aucune synchronisation bidirectionnelle (ADR-0001).
2. **Simplicité opérationnelle** : tout tourne avec `docker compose up` sur n'importe quelle machine (mini-PC du magasin, PC de secours, cloud). Un environnement = un fichier `.env`.
3. **Un seul langage** : TypeScript partout (ADR-0003). Moins de contexte à charger pour un agent IA, une seule chaîne d'outils, types partagés entre front et back.
4. **Invariants garantis par la base** : numérotation, stock non négatif, unicité, immuabilité du journal — contraintes et transactions, pas seulement du code applicatif.
5. **Testable** : les règles `RG-*` sont des fonctions pures testées unitairement ; le parcours complet est couvert par un test bout-en-bout.
6. **Sobriété** : le serveur cible est un mini-PC ; pas de composant lourd sans nécessité (pas de Kubernetes, pas de broker de messages, pas de navigateur headless côté serveur).

## 2. Architecture cible

```
                      MAGASIN — réseau Wi-Fi local (infrastructure critique)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Tablettes (PWA)   PC caisse (PWA)   Tablette livraison   TV écran public (opt.) │
 │        └───────────────┴─────────────────┴──────────────────┘             │
 │                         https://app.<domaine>  (DNS local → IP mini-PC)   │
 │                                      │                                    │
 │   MINI-PC (Ubuntu/Debian, Docker, onduleur)                               │
 │   ┌──────────────────────────────────▼─────────────────────────────────┐  │
 │   │ caddy (TLS, reverse proxy, fichiers statiques du front)            │  │
 │   │   ├─► api (Fastify + Prisma + Socket.IO)  ──►  postgres            │  │
 │   │   ├─► fichiers : PDF émis, fichiers Excel importés (volume)        │  │
 │   │ backup (pg_dump + rclone → stockage cloud chiffré)                 │  │
 │   │ cloudflared / tailscale (tunnel sortant, aucun port entrant)       │  │
 │   └──────────────────────────────────┬─────────────────────────────────┘  │
 └──────────────────────────────────────┼────────────────────────────────────┘
                                        │ Internet (connexion sortante)
                    ┌───────────────────┴───────────────────┐
                    │ Tunnel → https://app.<domaine>        │   Boss : téléphone / PC
                    │ Stockage cloud : sauvegardes          │   Admin : à distance
                    │ Surveillance : ping de disponibilité   │
                    └───────────────────────────────────────┘
```

### 2.1 Réseau et noms

- Un **nom de domaine** unique (`app.<domaine>`) partout. Dans le magasin, le DNS local (résolveur sur le mini-PC ou surcharge sur la box) le fait pointer vers l'IP fixe du mini-PC ; à l'extérieur, il pointe vers le tunnel. La PWA ne contient **aucune logique de détection** de réseau ; une tablette passée en 4G atteint le même serveur via le tunnel.
- Certificat TLS valide en local **et** à distance : Caddy avec défi DNS-01 (jeton API du fournisseur DNS). Le certificat est renouvelé quand Internet est disponible ; sa validité (90 jours) couvre largement une coupure.
- HTTPS obligatoire : requis pour la PWA (service worker), la caméra (scan code-barres) et les cookies sécurisés.
- Le Wi-Fi du magasin est une **infrastructure critique** : point d'accès professionnel, onduleur sur le point d'accès et le mini-PC, canal dédié, IP fixe pour le serveur.

### 2.2 Accès distant

- Tunnel sortant (recommandé : Cloudflare Tunnel ; alternative : Tailscale Funnel). Aucun port ouvert sur la box.
- Le trafic distant arrive avec un en-tête d'origine ; l'API l'utilise pour exiger la 2FA des rôles `owner` et `admin` (RG-USR-04) et refuser les rôles opérationnels hors du magasin (T3, validé : un commercial n'a pas de raison de vendre depuis l'extérieur). Le rôle `owner` doit pouvoir traiter une demande de remise depuis l'extérieur (RG-REM-03) : notification push via le service worker de la PWA quand le tunnel est joignable.

### 2.3 Sauvegarde et reprise

- `pg_dump` compressé toutes les **15 min** (incrémental logique : dernière heure) + complet chaque nuit ; chiffrement côté client ; envoi via `rclone` vers un stockage objet (Backblaze B2, Cloudflare R2, ou Google Drive en secours). Rétention : 48 dumps horaires, 30 quotidiens, 12 mensuels.
- Les fichiers (PDF émis, Excel importés) sont sauvegardés avec la base.
- **Procédure de reprise** documentée et **testée trimestriellement** : installer Docker sur une machine, restaurer `.env` + dernier dump + fichiers, `docker compose up`, repointer le DNS local. Objectif : RPO 15 min, RTO 2 h.
- Si le serveur meurt et qu'aucune machine de secours n'est disponible, la même stack se déploie sur un cloud (Fly.io, Render, VPS) en attendant.

### 2.4 Coupure d'Internet

- Le magasin fonctionne intégralement. Le boss perd le direct ; le tunnel se rétablit seul au retour.
- Les sauvegardes s'accumulent localement et sont envoyées au retour de la connexion.

### 2.5 Évolution V2 : réplique cloud en lecture seule

Réplication logique PostgreSQL (magasin → cloud) vers une instance qui ne reçoit jamais d'écriture. Le tableau de bord du boss y lit le dernier état connu même quand le magasin est hors ligne ; prépare le multi-magasins. Ne change rien à l'architecture V1.

## 3. Stack (ADR-0003)

| Couche | Choix | Statut | Justification |
|---|---|---|---|
| Langage | TypeScript 5, Node.js LTS (22) | figé | Un seul langage, types partagés |
| Monorepo | pnpm workspaces | recommandé | Simple, rapide, sans outillage lourd |
| Front | React 19 + Vite + `vite-plugin-pwa` | figé (React) | Écosystème, PWA installable, tablette |
| UI | Tailwind CSS + shadcn/ui | recommandé | Composants accessibles, gros boutons tactiles faciles |
| État serveur | TanStack Query | recommandé | Cache, invalidation sur événements temps réel |
| Formulaires / validation | react-hook-form + zod | recommandé | Schémas zod partagés avec l'API |
| Back | Fastify 5 | figé | Léger, rapide, adapté au mini-PC |
| ORM / migrations | Prisma | recommandé | Migrations versionnées, lisibilité pour les agents IA |
| Base | PostgreSQL 16 | figé | Transactions, contraintes, réplication logique en V2 |
| Temps réel | Socket.IO | recommandé | Reconnexion automatique, salles par poste/rôle |
| Auth | Sessions serveur (cookie httpOnly, SameSite=Lax) + CSRF ; argon2 ; TOTP pour 2FA | recommandé | Simple à raisonner, révocable, adapté aux postes partagés |
| PDF | pdfmake (génération serveur, sans navigateur headless) | recommandé | Léger ; gabarits déclaratifs versionnés |
| Excel | exceljs | recommandé | Lecture/écriture xlsx, formats numériques |
| Reverse proxy | Caddy | recommandé | TLS automatique, configuration minimale |
| Conteneurs | Docker Compose | figé | Même stack partout |
| Tests | Vitest (unit/intégration), Playwright (e2e) | recommandé | |
| Qualité | ESLint, Prettier, TypeScript strict, Husky (pré-commit : lint + typecheck) | recommandé | |
| Logs | pino (JSON), rotation par Docker | recommandé | |

Dépendances à éviter : ORM ou framework « magique » supplémentaire, bibliothèques d'état globales lourdes, tout composant nécessitant Chromium côté serveur.

## 4. Organisation du dépôt

Racine du dépôt : `F:\Documents\Programmation\Vente WEB` (organisation imposée par l'utilisateur, 21/09/2026).

```
Vente WEB/
├── CLAUDE.md                  # point d'entrée des agents IA
├── AGENTS.md                  # renvoi vers CLAUDE.md pour les autres outils
├── .claude/                   # commandes et réglages Claude Code (créés au GO)
├── Docs/                      # spécifications, ADR, backlog, journal (ce dossier)
├── Autres/                    # documents fournis par l'utilisateur : logos, manuels, modèles, captures
├── Dist/                      # livrables construits, à déployer sur le serveur ou les clients (non versionné)
└── Source/                    # racine du monorepo TypeScript
    ├── package.json
    ├── pnpm-workspace.yaml
    ├── .env.example
    ├── apps/
    │   ├── web/               # PWA React (tous les espaces : sales, cashier, warehouse, manager, owner, admin, display)
    │   └── api/               # Fastify + Prisma + Socket.IO
    ├── packages/
    │   ├── shared/            # types, schémas zod, règles pures (pricing, discount, numbering, formatting)
    │   └── config/            # eslint, tsconfig, prettier partagés
    └── infra/
        ├── docker-compose.yml # dev
        ├── docker-compose.prod.yml
        ├── caddy/Caddyfile
        ├── backup/            # scripts pg_dump + rclone, cron
        └── restore.md         # procédure de reprise
```

- Tout le code vit sous `Source/` ; toutes les commandes (`pnpm`, `docker compose`) s'exécutent depuis `Source/`.
- `Dist/` reçoit le résultat des builds (front statique, images Docker exportées, éventuel APK/TWA) ; son contenu est reproductible depuis `Source/` et n'est pas versionné.
- `Autres/` contient ce que l'utilisateur fournit (logo pour les factures, manuels, exemples de fichiers Excel, captures d'écran) ; les agents y lisent, n'y écrivent pas sans demande.
- Une seule application front avec **un espace par rôle** (routes `/sales`, `/register`, `/warehouse`, `/manager`, `/owner`, `/admin`, `/display`). L'espace affiché dépend du rôle actif ; les composants métier sont partagés.
- `Source/packages/shared` contient les **règles pures** (calcul des totaux, répartition des remises, contrôle de politique, formatage MGA, machine à états des commandes) : testées unitairement, utilisées à l'identique par le front (affichage immédiat) et par l'API (vérité).

## 5. Modèle de données (esquisse)

Identifiants : UUID v7 (ordonnés dans le temps). Montants : `NUMERIC(14,2)`. Quantités : `NUMERIC(12,2)` (RG-ART-04), toujours en **unité de base** dans les tables de stock. Facteurs de conversion : `NUMERIC(12,3)`. Horodatages : `timestamptz`. Tous les noms en anglais selon `glossaire.md`.

| Table | Champs principaux | Contraintes / notes |
|---|---|---|
| `users` | username, full_name, roles[] (enum), pin_hash, password_hash, totp_secret, ticket_letter, is_active | `ticket_letter` unique parmi les actifs ayant le rôle `sales` |
| `stations` | type (SALES, REGISTER, DELIVERY, DISPLAY), name, display_key, is_active | Nombre libre par type ; au plus un DISPLAY actif (H11) |
| `sessions` | user_id, active_role, station_id, origin (LAN/REMOTE), expires_at | |
| `categories` | name, max_discount_pct (nullable) | |
| `products` | sku (= code article), name, category_id, base_unit (libellé de l'unité de base), max_discount_pct (nullable → catégorie → paramètre), alert_threshold, is_active, last_entry_at | `sku` unique (insensible à la casse) ; **aucun prix sur l'article** (RG-ART-03) ; « vendable » = existe une `product_units` active avec un `product_prices` en vigueur (H14) |
| `product_units` | product_id, label, factor (`numeric(12,3)`, > 0), is_base, barcode, max_discount_pct (nullable → surcharge, RG-REM-01), is_active, created_at | `UNIQUE (product_id, label)` ; **une seule** ligne `is_base` par produit (index partiel unique), avec `factor = 1` ; `barcode` unique si non nul ; `factor` gelé dès qu'une `order_lines` la référence (contrôle applicatif + trigger) (RG-ART-06) |
| `product_prices` | product_unit_id, price, effective_from, effective_to (nullable = en vigueur), source (IMPORT, MANUAL), import_batch_id (nullable), set_by, created_at | **Ajout seul** (pas d'UPDATE sauf `effective_to`, pas de DELETE) ; **au plus une** ligne avec `effective_to IS NULL` par unité (index partiel unique) ; `CHECK (effective_to IS NULL OR effective_to > effective_from)` ; nouveau prix = dans une transaction : clôture de l'ancien à `effective_from` + insertion (RG-ART-07) ; prix en vigueur à l'instant *t* = `effective_from <= t AND (effective_to IS NULL OR effective_to > t)` (gère les dates d'effet futures [V1.1]) ; index `(product_unit_id, effective_from DESC)` |
| `product_stock` | product_id (PK), on_hand, reserved | En **unité de base** ; `CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)` ; mis à jour dans la même transaction que le mouvement ; contrôle d'intégrité nocturne contre `stock_movements` |
| `stock_movements` | product_id, type (IMPORT, ADJUSTMENT, DELIVERY, RETURN, STOCKTAKE), qty (signée, unité de base), product_unit_id, unit_qty (quantité telle que saisie, dans l'unité), import_batch_id, entry_date, order_id, user_id, reason, created_at | Ajout seul (pas d'UPDATE/DELETE : révoqués au niveau du rôle SQL applicatif) ; `qty = unit_qty × factor` au moment du mouvement |
| `reservations` | order_id, product_id, qty (unité de base), expires_at (null = ferme), status (ACTIVE, RELEASED, CONSUMED) | `expires_at` = fin de journée `day_end_time` (RG-STK-02) ; index pour le balayage |
| `import_batches` | file_path, file_name, mode (ENTRY, STOCKTAKE), status (PREVIEW, COMMITTED, CANCELLED), entry_date, user_id, rows_total, rows_ok, rows_error, preview (jsonb), summary (jsonb), created_at, committed_at | Le fichier est analysé et la prévisualisation stockée à l'étape 2 ; les mouvements ne sont créés qu'au passage COMMITTED (RG-IMP-04) |
| `customers` | name, phone, notes, is_active, merged_into_id | `name` et `phone` obligatoires ; `phone` unique parmi les actifs (RG-DEV-04) |
| `orders` | number, status (enum §5.2 du CDC métier), sales_user_id, customer_id, ticket_letter, ticket_seq, ticket_date, queue_rank, priority, no_show_count, register_station_id, cashier_user_id, subtotal, discount_total, vat_total, rounding, total, expires_at, submitted_at, called_at, paid_at, ready_at, delivered_at, cancel_reason, version | `UNIQUE (ticket_date, ticket_letter, ticket_seq)` ; `version` pour le verrouillage optimiste |
| `order_lines` | order_id, product_id, product_unit_id, product_price_id, sku, name, unit_label, factor, qty (dans l'unité de vente), base_qty (= qty × factor, unité de base), unit_price, max_discount_pct (figé), discount_pct, discount_amount, discount_source (NONE, WITHIN_CAP, CODE), discount_code_id, line_total, delivered_qty | Snapshot des attributs article, unité, facteur et plafond compris ; `product_price_id` = prix en vigueur à la validation (RG-CMD-04, RG-ART-07) ; réservation et sortie de stock sur `base_qty` |
| `discount_requests` | order_id, line_id (null = globale), customer_id, requested_pct, requested_amount, reason, status (PENDING, GRANTED, REJECTED), requested_by, decided_by, decided_pct, decided_at, discount_code_id | Une seule demande PENDING par commande ; décideur = rôle `owner` uniquement (RG-REM-03) |
| `discount_codes` | code, pct, amount, order_id (nullable), customer_id (nullable), request_id (nullable), issued_by, issued_at, expires_at, status (ACTIVE, USED, EXPIRED, REVOKED), used_at, used_on_order_id, revoked_at | `code` unique ; usage unique garanti par `UPDATE … WHERE status = 'ACTIVE'` dans la transaction de rattachement (RG-REM-04) |
| `register_sessions` | station_id, cashier_id, opened_at, opening_float, closed_at, counted_cash, expected_by_method (jsonb), variance, note, validated_by | Une seule ouverte par caissier (index partiel unique) |
| `payment_methods` | code, label, requires_reference, is_active, sort_order | |
| `payments` | order_id, invoice_id, register_session_id, cashier_id, total_due, cash_received, change_given, created_at | |
| `payment_lines` | payment_id, method_id, amount, reference | |
| `number_sequences` | key (ex. `INVOICE-2026`), next_value | Lecture avec `SELECT … FOR UPDATE` dans la transaction du paiement |
| `invoices` | number, year, seq, order_id, issued_at, snapshot (jsonb), pdf_path, status (ISSUED, CREDITED, PARTIALLY_CREDITED) | `UNIQUE (year, seq)` ; aucune colonne modifiable après émission sauf `status` |
| `credit_notes` | number, invoice_id, amount, reason, refund_method_id, refund_reference, issued_by, approved_by, pdf_path, issued_at | |
| `deliveries` | order_id, warehouse_user_id, station_id, started_at, ready_at, delivered_at, issue_note | |
| `audit_log` | at, user_id, active_role, station_id, origin, action, entity_type, entity_id, before (jsonb), after (jsonb), reason | Ajout seul ; partitionnée par mois |
| `settings` | key (PK), value (jsonb), updated_by, updated_at | Historique des changements dans `audit_log` |

Points d'attention :

- **Numérotation sans trou** (RG-FAC-01) : le numéro est pris dans la transaction qui enregistre le paiement et crée la facture ; si la transaction échoue, le numéro n'est pas consommé. Test de concurrence obligatoire (10 paiements simultanés → 10 numéros consécutifs).
- **Conversion d'unité** (RG-ART-06) : `base_qty = round(qty × factor, 2)` calculé une seule fois, à la validation, dans `Source/packages/shared` ; toutes les écritures de stock utilisent `base_qty`. Les lignes d'une même commande portant le même `product_id` sont cumulées avant le contrôle de disponibilité (RG-CMD-02).
- **Réservation** (RG-STK-02) : `UPDATE product_stock SET reserved = reserved + base_qty WHERE product_id = ? AND on_hand - reserved >= base_qty` ; zéro ligne affectée = indisponible.
- **Nouveau prix** (RG-ART-07) : transaction `UPDATE product_prices SET effective_to = :from WHERE product_unit_id = ? AND effective_to IS NULL` puis `INSERT` ; l'index partiel unique refuse toute course. Le prix « en vigueur » est résolu côté serveur à chaque lecture du catalogue (jamais mis en cache sur l'article), et un événement `catalog.changed` fait recharger les tablettes.
- **Immutabilité des prix** : `product_prices` n'admet ni `DELETE` ni `UPDATE` hors `effective_to` (trigger) ; l'historique est complet par construction. Balayage des expirations toutes les 30 s par une tâche interne de l'API (pas de service séparé).
- **Sortie de stock** (RG-STK-04) : à la livraison, `on_hand -= base_qty ; reserved -= base_qty` + mouvement `DELIVERY`, dans une transaction.
- **Immutabilité** : le rôle SQL utilisé par l'API n'a pas les droits `UPDATE`/`DELETE` sur `audit_log`, `stock_movements`, `product_prices` (hors `effective_to`), `payments`, `payment_lines`, `invoices` (hors `status`) et `credit_notes`. Les corrections passent par des écritures compensatoires.

## 6. API

- REST JSON sous `/api/v1`, validée par les schémas zod de `Source/packages/shared` ; erreurs au format `{ code, message, details }` avec codes stables (ex. `STOCK_UNAVAILABLE`, `PRODUCT_NOT_SELLABLE`, `UNIT_FACTOR_LOCKED`, `DISCOUNT_ABOVE_CAP`, `DISCOUNT_CODE_INVALID`, `DISCOUNT_REQUEST_PENDING`, `CUSTOMER_REQUIRED`, `INVOICE_SEQUENCE_CONFLICT`).
- Ressources principales : `auth`, `users`, `stations`, `products` (+ sous-ressources `units`, `units/{id}/prices` : GET = historique, POST = nouveau prix daté ; `price-history` en lecture), `categories`, `stock` (movements, adjustments), `imports` (+ actions `preview`, `commit`, `cancel`), `customers`, `orders` (+ actions `submit`, `call`, `no-show`, `cancel`, `reactivate`, `redeem-code`), `discount-requests` (+ actions `grant`, `reject`), `discount-codes` (+ action `revoke`), `payments`, `invoices`, `credit-notes`, `queues` (+ `reorder`), `deliveries` (+ `claim`, `release`), `register-sessions`, `reports`, `exports`, `settings`, `audit`.
- Idempotence des actions sensibles (paiement, validation) par clé `Idempotency-Key` fournie par le client : une double soumission réseau ne crée pas deux paiements.
- Verrouillage optimiste sur `orders.version` : une modification concurrente (caissier et responsable) est rejetée proprement avec rechargement.
- Documentation OpenAPI générée depuis les schémas ; servie sur `/api/docs` en dev uniquement.

### 6.1 Temps réel (Socket.IO)

Salles : `role:<role>`, `station:<id>`, `queue:register`, `queue:delivery`, `display`, `order:<id>`.

| Événement | Émis quand | Destinataires |
|---|---|---|
| `queue.changed` | entrée, sortie, réordonnancement, absence | files concernées, manager, owner |
| `ticket.called` | appel caisse ou livraison | display, files, order |
| `order.status_changed` | toute transition | order, manager, owner, station d'origine |
| `discount.request_created` | demande de remise exceptionnelle | **owner** (push + app, y compris à distance), manager (lecture), order |
| `discount.request_decided` / `discount.code_issued` | décision du boss / code émis | order, station d'origine, cashier, manager |
| `ticket.verbal_call` | appel sans écran public (RG-DSP-05) | station appelante, station du commercial de la commande |
| `stock.alert` | disponible ≤ seuil | manager, owner |
| `catalog.changed` | nouveau prix en vigueur, unité créée/désactivée, import validé | sales, cashier, manager (rechargement du catalogue, RG-ART-07) |
| `dashboard.tick` | après tout paiement/avoir/livraison | owner, manager |

Le client applique l'événement puis **revalide** la ressource via l'API (jamais de confiance aveugle dans le contenu d'un événement).

## 7. Front (PWA)

- Une application, un espace par rôle ; navigation limitée au rôle actif ; sélecteur de rôle pour les cumuls.
- **Tablette-first** pour `/sales` et `/warehouse` (cibles tactiles ≥ 48 px, contraste élevé, pas de survol), **desktop-first** pour `/register`, `/manager`, `/admin`, **mobile-first** pour `/owner`, plein écran sans interaction pour `/display`.
- PWA : manifeste (icône, nom, `display: standalone`), service worker qui met en cache **uniquement l'enveloppe applicative** ; aucune écriture hors ligne ; bandeau clair « Serveur injoignable » avec nouvelle tentative automatique.
- Scan code-barres via la caméra (`BarcodeDetector` quand disponible, sinon bibliothèque JS) ; saisie clavier compatible douchettes USB à la caisse.
- Formatage MGA et dates par une fonction unique de `Source/packages/shared` (RG-FMT-01) ; jamais de formatage ad hoc.
- Impression : `window.print()` d'une vue PDF en MVP ; impression thermique directe côté serveur (ESC/POS) en V1.1.
- Écran public : reconnexion automatique, affichage des 5 derniers appels, son optionnel (déclenché après une interaction initiale, contrainte navigateur).

## 8. Sécurité

- Mots de passe et PIN hachés (argon2id) ; PIN accepté uniquement depuis le réseau local (origin LAN) et pour les rôles opérationnels ; mot de passe + TOTP pour `owner`/`admin` à distance.
- Sessions serveur révocables ; verrouillage d'inactivité côté client et expiration côté serveur ; déconnexion de tous les postes possible par l'admin.
- Contrôle d'accès **côté API** par rôle actif et par objet (un commercial ne modifie que ses commandes) ; la matrice de l'annexe B du CDC métier est encodée dans un seul module de permissions testé.
- Limitation de débit sur l'authentification ; journalisation des échecs ; blocage 15 min après 5 échecs.
- En-têtes de sécurité (CSP stricte, HSTS), CSRF par jeton double soumission, validation systématique des entrées, aucun HTML non échappé.
- Secrets uniquement dans `.env` (jamais dans le dépôt) ; `.env.example` documenté.
- Fichiers uploadés (Excel) : taille max 10 Mo, type vérifié, stockés hors de la racine web, jamais exécutés.
- Mises à jour de sécurité : images Docker reconstruites mensuellement ; `pnpm audit` en CI.

## 9. Import / export / PDF

- **Import** : parsing exceljs en flux ; validation par ligne avec les schémas zod, puis **regroupement par `code`** (une ligne par unité de vente, RG-IMP-01 : contrôle de l'unité de base unique, cohérence catégorie/désignation, facteurs gelés) ; conversion des quantités en unité de base ; comparaison des prix au prix en vigueur (création de `product_prices` uniquement si différent, `source = IMPORT`) ; prévisualisation renvoyée au client (compteurs + erreurs + variations de prix) ; import définitif dans une transaction (tout ou rien) ou en mode « lignes valides seulement » ; fichier archivé dans le volume `files/imports/<batch_id>/`.
- **Export** : génération serveur exceljs, colonnes définies dans `Source/packages/shared/exports.ts` (source unique de vérité pour les en-têtes) ; nombres natifs avec format `# ##0,00`.
- **PDF** : gabarits pdfmake dans `Source/apps/api/src/pdf/templates/` ; fichier écrit dans `files/invoices/<year>/<number>.pdf` à l'émission ; réimpression = envoi du fichier existant (RG-FAC-04). Polices embarquées (pas de dépendance système).

## 10. Déploiement

### 10.1 Environnements

| Environnement | Où | Données | Usage |
|---|---|---|---|
| `dev` | PC du développeur / agent IA, `docker compose up` | jeu de données de démonstration (seed) | développement, tests |
| `staging` (optionnel) | second mini-PC ou cloud gratuit | copie anonymisée | recette avant mise à jour |
| `prod` | mini-PC du magasin | réelles | exploitation |

### 10.2 Serveur du magasin (matériel minimal)

Mini-PC 4 cœurs, 16 Go RAM, SSD 256 Go, Ethernet vers le point d'accès, **onduleur** dimensionné pour 30 min (mini-PC + point d'accès + box), Ubuntu Server LTS ou Debian, Docker, démarrage automatique des conteneurs (`restart: unless-stopped`), arrêt propre sur signal onduleur.

### 10.3 Composition (`docker-compose.prod.yml`)

`caddy` (80/443, TLS DNS-01, sert `Source/apps/web/dist`, proxy `/api` et `/socket.io`) · `api` · `postgres` (volume persistant) · `backup` (cron : dump + rclone) · `cloudflared` (tunnel). Volumes : `pgdata`, `files`, `caddy_data`.

### 10.4 Mise à jour

`git pull` → `docker compose build` → migrations Prisma (`migrate deploy`, réversibles testées en staging) → redémarrage ; fenêtre hors ouverture ; sauvegarde complète avant chaque mise à jour ; procédure de retour arrière documentée.

### 10.5 Surveillance

- Endpoint `/healthz` (API + base + espace disque) interrogé par un service de ping externe via le tunnel ; alerte e-mail/SMS à l'admin et au boss si indisponible 5 min.
- Alertes locales : disque < 15 %, sauvegarde en échec, session de caisse non clôturée (RG-CAI-05), certificat à < 15 jours.
- Logs JSON conservés 90 jours localement.

## 11. Tests et qualité

- **Unitaires** (`Source/packages/shared`, services de l'API) : totaux et répartition des remises (RG-REM-06), résolution du plafond article → catégorie → paramètre (RG-REM-01/02), codes de remise (unicité, usage unique sous concurrence, expiration, révocation — RG-REM-04), machine à états (RG-CMD-06), numérotation (RG-FAC-01, avec test de concurrence), réservation et expiration en fin de journée (RG-STK-02, RG-CMD-08), disponible = théorique − réservé sur tous les états non livrés (RG-STK-01), formatage montants et quantités décimales (RG-FMT-01, RG-ART-04), conversion unité de vente → unité de base et cumul des lignes d'un même article (RG-ART-06, RG-CMD-02), historique des prix (jamais deux prix en vigueur, résolution du prix à une date, prix figé sur la ligne — RG-ART-07, RG-CMD-04), résolution du plafond unité → article → catégorie → paramètre (RG-REM-01), validation et prévisualisation d'import multi-lignes (RG-IMP-01/03/04).
- **Intégration API** : chaque ressource contre une base PostgreSQL de test (conteneur éphémère), permissions de l'annexe B (dont : seul `owner` peut `grant`/`reject` une demande de remise ; `cashier` ne peut modifier aucune remise).
- **Bout-en-bout Playwright** : parcours complet client → devis → commande → appel → paiement mixte → facture PDF → livraison → sortie de stock ; parcours remise exceptionnelle (demande → notification boss → code → rattachement → facture) ; parcours import en quatre temps avec annulation puis validation (fichier multi-unités, changement de prix visible dans l'historique) ; parcours vente en carton (réservation et sortie de stock en pièces) ; parcours expiration en fin de journée ; parcours annulation après paiement ; parcours sans écran public (appel verbal).
- **Definition of Done** d'une tâche : code + tests verts + lint/typecheck OK + règle `RG` référencée dans le test + documentation mise à jour (CDC si la règle change, journal) + revue.
- Couverture visée : 90 % sur `Source/packages/shared`, 80 % sur l'API.
- CI (GitHub Actions ou équivalent) : lint, typecheck, tests, build des images.

## 12. Performance et dimensionnement

- Cibles : ≤ 30 clients simultanés, ≤ 2 000 commandes/jour, ≤ 50 000 articles ; réponse API p95 < 300 ms en local ; propagation temps réel < 2 s.
- Index sur `products(sku)`, `product_units(barcode)`, `products(name)` (trigram pour la recherche), `product_prices(product_unit_id, effective_from DESC)`, `orders(status, queue_rank)`, `reservations(expires_at)`, `invoices(year, seq)`, `audit_log(at)`.
- Recherche catalogue côté serveur avec pagination ; cache court (30 s) des indicateurs du tableau de bord.
- 10 ans d'historique : ~5 M lignes d'audit ; partitionnement mensuel de `audit_log` et archivage annuel possible.

## 13. Hypothèses techniques — validées le 21/09/2026

| # | Hypothèse | Décision | Alternative écartée |
|---|---|---|
| T1 | Cloudflare Tunnel + nom de domaine chez Cloudflare (gratuit) | **OK** | Tailscale ; VPN maison |
| T2 | Stockage des sauvegardes : Backblaze B2 ou Cloudflare R2 (quelques centimes/mois) | **OK** | Google Drive via rclone |
| T3 | Rôles opérationnels refusés hors du magasin (le boss, lui, agit à distance : demandes de remise) | **OK** | Autoriser avec 2FA |
| T4 | Mini-PC dédié sous Linux (pas le PC de caisse Windows) | **OK** | Docker Desktop sur le PC de caisse (déconseillé : redémarrages, verrouillage, performances) |
| T5 | Sessions cookie plutôt que JWT | **OK** | JWT si un client natif (TWA) exige des jetons |
| T6 | pdfmake plutôt que HTML→PDF par navigateur headless | **OK** | Playwright PDF si la fidélité visuelle prime |
| T7 | Un seul écran public (deux files affichées ensemble) | **OK**, et écran optionnel : 0 ou 1 (H11, appel verbal sinon) | Un écran par file |
| T8 | Impression thermique en V1.1 via serveur ESC/POS | **OK** | Dès le MVP |
