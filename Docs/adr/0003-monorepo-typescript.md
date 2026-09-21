# ADR-0003 — Monorepo TypeScript : React + Vite (PWA), Fastify + Prisma, PostgreSQL, Docker Compose

Date : 21/09/2026 · Statut : **Accepté** par l'utilisateur le 21/09/2026

## Contexte
Le projet sera développé principalement par des agents de codage IA. Chaque langage, framework ou outil supplémentaire est du contexte à charger et une source d'incohérence entre sessions. Le serveur cible est un mini-PC modeste. Il faut du temps réel (files, appels), des PDF, de l'Excel et une base transactionnelle solide.

## Décision
- Un seul langage : TypeScript, Node.js LTS.
- Monorepo pnpm : `Source/apps/web` (React + Vite + PWA), `Source/apps/api` (Fastify + Prisma + Socket.IO), `Source/packages/shared` (types, schémas zod, règles pures).
- Base PostgreSQL 16 ; les invariants critiques (numérotation sans trou, stock non négatif, immuabilité des tables sensibles) sont garantis par contraintes, transactions et droits SQL, pas seulement par le code.
- Docker Compose pour tous les environnements ; Caddy en frontal.
- Les règles métier calculables (totaux, remises, machine à états, formatage) vivent dans `Source/packages/shared`, utilisées à l'identique par le front et l'API.

## Conséquences
- Types et validations partagés ; un changement de schéma se propage au front par le compilateur.
- Les agents n'ont qu'une chaîne d'outils à connaître (`pnpm`, `vitest`, `playwright`, `prisma`, `docker compose`).
- Les composants choisis « recommandé » dans le CDC technique (Tailwind, shadcn/ui, TanStack Query, pdfmake, exceljs, Socket.IO) peuvent être remplacés par un ADR ultérieur ; TypeScript, React, Fastify, PostgreSQL et Docker Compose sont figés.
- Pas de navigateur headless côté serveur (PDF via pdfmake) pour rester léger sur le mini-PC.

## Alternatives écartées
- Backend Python (FastAPI/Django) — deuxième langage, deux chaînes d'outils.
- Next.js full-stack — serveur personnalisé nécessaire pour le WebSocket, moins lisible pour séparer API et front.
- Supabase (Postgres + Auth + Realtime hébergés) — rapide à démarrer mais incompatible avec le serveur local maître (ADR-0001) et dépendance forte.
- NestJS — conventions fortes mais verbosité et abstraction supplémentaires sans besoin identifié.
