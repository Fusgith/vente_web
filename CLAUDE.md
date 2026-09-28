# Vente Web — guide de l'agent IA

> À lire en entier au début de chaque session. Ce fichier est volontairement court : les détails sont dans `Docs/`.

## Mission
Application web (PWA) de gestion des ventes d'un magasin de marchandise générale à Madagascar :
commercial sur tablette (devis → commande, remises dans les plafonds), caisse (paiement, facture),
livraison par plusieurs magasiniers, appel des clients par numéro ou verbal, boss à distance
(tableau de bord ; remises exceptionnelles accordées par code à usage unique).

## ✅ Statut : DÉVELOPPEMENT — GO donné le 21/09/2026 (`Docs/journal.md`)
- Le code vit sous `Source/` ; on avance **une tâche du backlog à la fois** (`T-nnn`), directement sur `main` : pas de branche ni de PR (l'utilisateur travaille seul avec l'agent, 23/09/2026).
- Les CDC restent la référence : une règle `RG-*` qui change se modifie d'abord dans `Docs/01-cdc-metier.md`.
- H14–H28 tranchées le 26/09/2026, H29 le 27/09/2026, H30 le 28/09/2026 (CDC métier §16.5 à §16.7) ; aucune ouverte. Un nouveau doute s'inscrit ⚠️ HYPOTHÈSE au CDC concerné et se code selon sa formulation écrite.

## Langues
- Documentation, interface utilisateur, messages, journal : **français**.
- Code (identifiants, commentaires, messages de commit) : **anglais**, en suivant `Docs/glossaire.md` (ADR-0004).

## Organisation du dépôt (`F:\Documents\Programmation\Vente WEB`)
Distant `origin` : https://github.com/Fusgith/vente_web.git — branche principale `main`.
- `Docs/` — spécifications, ADR, backlog, journal.
- `Source/` — tout le code (monorepo) ; les commandes s'exécutent depuis ce dossier.
- `Dist/` — livrables construits à déployer (serveur, clients) ; non versionné, jamais édité à la main.
- `Autres/` — documents fournis par l'utilisateur (logos, manuels, exemples Excel) ; lecture seule pour l'agent.

## Ordre de lecture
1. `Docs/journal.md` — où on en est (dernière entrée en premier).
2. `Docs/backlog.md` — quoi faire ensuite.
3. `Docs/01-cdc-metier.md` — le métier ; les règles `RG-XXX-nn` font foi.
4. `Docs/02-cdc-technique.md` — architecture et stack.
5. `Docs/03-cdc-agent-ia.md` — comment travailler (protocole de session, ADR, DoD).
6. `Docs/adr/` — décisions figées ; on ne les contredit jamais sans écrire un nouvel ADR.
7. `Docs/glossaire.md` — vocabulaire métier FR ↔ EN.

## Invariants non négociables (détail dans le CDC métier)
- Numéro de facture séquentiel, sans trou, jamais réutilisé, jamais modifié (RG-FAC-01).
- Toute opération sensible (remise, paiement, annulation, mouvement de stock, correction admin) est
  journalisée : qui, quand, quoi, avant → après (RG-AUD-01). Jamais d'écriture directe en base.
- Une seule base de données maître : le serveur local du magasin. Pas de synchro bidirectionnelle (ADR-0001).
- Stock : réservé à la validation commerciale, sorti à la livraison (RG-STK-02, RG-STK-04) ; un seul stock par
  article, en **unité de base** ; les unités de vente s'y convertissent par leur facteur (RG-ART-06).
- Prix : porté par l'unité de vente, jamais écrasé — tout changement crée un nouveau prix daté (RG-ART-07).
- Devise MGA (Ariary). Affichage `1 250 000,00 MGA` : espace insécable pour les milliers, virgule décimale,
  2 décimales ; « Ariary » en toutes lettres, jamais « Ar » ; dans un tableau, « (MGA) » une seule fois
  dans l'en-tête de chaque colonne de montants, le nombre seul dans les cellules (RG-FMT-01).
- Remise sur chaque ligne et/ou sur le total, en % ou en montant, dans les plafonds sauf code du boss (RG-REM-06) ;
  devis, commande et facture en tableau (RG-DEV-05).
- TVA optionnelle (paramètre), désactivée par défaut (RG-FAC-03).

## Rôles
`admin`, `responsable`, `commercial`, `caissier`, `magasinier`, `boss` + mode « écran public » sans compte.
Rôles fixes : l'admin attribue les rôles, il n'en crée pas. Détail : CDC métier §3 et annexe B.

## Protocole de session (détail dans `Docs/03-cdc-agent-ia.md`)
- **Début** : lire ce fichier, la dernière entrée du journal, le backlog ; `git status`.
- **Pendant** : une tâche du backlog à la fois ; décision structurante → ADR ; hypothèse → section
  « Hypothèses à valider » du CDC concerné, marquée ⚠️ HYPOTHÈSE.
- **Fin** : mettre à jour `Docs/journal.md` (fait / reste / décisions / questions) et `Docs/backlog.md`.
  Committer et pousser sur `origin/main` **sans solliciter l'utilisateur** (accord permanent du 23/09/2026 : git ne doit pas le déranger).
  Dernière ligne de chaque message de commit : `Powered by Claude Opus` (jamais `Co-Authored-By` : l'agent est le moteur, pas l'auteur).

## Stack (figée par ADR-0003)
Monorepo TypeScript (pnpm) · React + Vite + PWA · Fastify + Prisma · PostgreSQL · Socket.IO ·
Docker Compose · Vitest + Playwright. Commandes (depuis `Source/`) : `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — détail dans `Source/CLAUDE.md`.

## Ce que l'agent ne fait jamais
- Forcer un push ou réécrire l'historique publié ; committer un secret. Modifier un ADR existant (en créer un nouveau).
- Toucher aux données de production, à la numérotation des factures ou au journal d'audit par script ad hoc.
- Ajouter une dépendance sans la justifier dans le journal.
- Inventer un besoin métier : en cas de doute, poser la question ou consigner l'hypothèse.
