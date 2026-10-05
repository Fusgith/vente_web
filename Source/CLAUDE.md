# Source/ — monorepo (guide court)

Lire d'abord `../CLAUDE.md`. Ici : commandes et structure. Détail : `../Docs/02-cdc-technique.md`.

## Commandes (depuis `Source/`)

- `pnpm install` — dépendances (Node ≥ 22.12 ; version de pnpm pilotée par `packageManager`). Sans droits admin
  sous Windows : `corepack enable --install-directory "%APPDATA%\npm" pnpm` crée le shim `pnpm` dans le PATH utilisateur.
- `pnpm demarrer` (ou double-clic sur `../Lancer Vente Web.cmd`) — tout en un : Docker Desktop, `.env` depuis `.env.example` s'il manque, base, migrations, seed, `pnpm dev`, navigateur.
- `pnpm dev` — API (`tsx watch`, port 3000) + PWA (Vite, port 5173, proxy `/api` et `/socket.io`).
- `pnpm db:up` / `pnpm db:down` — PostgreSQL 16 de dev (`infra/docker-compose.yml`, lit `.env`).
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm format:check` · `pnpm build` ; `pnpm check` enchaîne tout.
- `pnpm dist --nom "Épicerie Rasoa" --nom-court "Rasoa"` — version distribuable au nom voulu dans `../Dist/<nom-simplifié>/` (ADR-0006) ; sans `--nom`, le nom par défaut (`packages/shared/src/brand.json`).
- `pnpm --filter @vente-web/api <script>` pour cibler un paquet ; `pnpm test:watch` en développement.

## Structure

- `apps/api` — Fastify 5 ; `src/index.ts` (démarrage), `src/app.ts` (`buildApp`, testable avec `inject`), `src/env.ts` (zod), `src/routes/*`.
- `apps/web` — React 19 + Vite + PWA + Tailwind v4 ; libellés français dans `src/labels.ts`, jamais dans la logique.
- `packages/shared` — règles pures (formats RG-FMT-01, remises, numérotation…) sans base ni réseau ; compilé en `dist/` (`tsc -b`), consommé en source (`development`) par Vite/tsx.
- `packages/config` — `tsconfig.base.json`, ESLint (flat), Prettier.
- `infra/` — Docker Compose dev ; prod, Caddy, sauvegardes : T-080/T-081.
- Tests : Vitest à la racine (`vitest.config.ts` → projets `shared`, `api`, `web`) ; e2e Playwright plus tard (T-083).

## Conventions

- Code en anglais selon `../Docs/glossaire.md` ; commentaires : le _pourquoi_ + la règle `RG-*` citée.
- Fichiers < 400 lignes ; `any` interdit sans justification ; imports de type avec `import type`.
- `.env` jamais commité ; variables documentées dans `.env.example` et validées dans `apps/api/src/env.ts`.
- Nouvelle dépendance → justification dans `../Docs/journal.md`.
