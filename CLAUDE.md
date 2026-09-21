# Vente Web — guide de l'agent IA

> À lire en entier au début de chaque session. Ce fichier est volontairement court : les détails sont dans `Docs/`.

## Mission
Application web (PWA) de gestion des ventes d'un magasin de marchandise générale à Madagascar :
commercial sur tablette (devis → commande), caisse (contrôle des remises, paiement, facture),
livraison, appel des clients par numéro, tableau de bord du boss accessible à distance.

## ⛔ Statut : PHASE SPÉCIFICATION — AUCUN CODE SANS « GO »
- Tant que l'utilisateur n'a pas écrit explicitement **GO** (ou « GO pour coder ») dans la conversation,
  on ne produit **aucun code applicatif** : pas de `package.json`, pas de scaffolding, pas de script.
- Travail autorisé sans GO : rédaction et amendement des documents de `Docs/`, ADR, backlog, journal, ce fichier ; lecture de `Autres/`.
- Le GO sera consigné dans `Docs/journal.md` avec sa date.

## Langues
- Documentation, interface utilisateur, messages, journal : **français**.
- Code (identifiants, commentaires, messages de commit) : **anglais**, en suivant `Docs/glossaire.md` (ADR-0004).

## Organisation du dépôt (`F:\Documents\Programmation\Vente WEB`)
Distant `origin` : https://github.com/Fusgith/vente_web.git — branche principale `main`.
- `Docs/` — spécifications, ADR, backlog, journal (les seuls fichiers modifiables avant le GO).
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
- Stock : réservé à la validation commerciale, sorti à la livraison (RG-STK-02, RG-STK-04).
- Devise MGA (Ariary). Affichage `1 250 000,00 Ar` : espace insécable pour les milliers, virgule décimale,
  2 décimales (RG-FMT-01).
- TVA optionnelle (paramètre), désactivée par défaut (RG-FAC-03).

## Rôles
`admin`, `responsable`, `commercial`, `caissier`, `magasinier`, `boss` + mode « écran public » sans compte.
Rôles fixes : l'admin attribue les rôles, il n'en crée pas. Détail : CDC métier §3 et annexe B.

## Protocole de session (détail dans `Docs/03-cdc-agent-ia.md`)
- **Début** : lire ce fichier, la dernière entrée du journal, le backlog ; `git status`.
- **Pendant** : une tâche du backlog à la fois ; décision structurante → ADR ; hypothèse → section
  « Hypothèses à valider » du CDC concerné, marquée ⚠️ HYPOTHÈSE.
- **Fin** : mettre à jour `Docs/journal.md` (fait / reste / décisions / questions) et `Docs/backlog.md`.
  Proposer un commit ; ne pas committer sans accord.

## Stack (figée par ADR-0003, à instancier après le GO)
Monorepo TypeScript (pnpm) · React + Vite + PWA · Fastify + Prisma · PostgreSQL · Socket.IO ·
Docker Compose · Vitest + Playwright. Commandes de build/test : à compléter après le GO.

## Ce que l'agent ne fait jamais
- Coder avant le GO. Committer ou pusher sans accord. Modifier un ADR existant (en créer un nouveau).
- Toucher aux données de production, à la numérotation des factures ou au journal d'audit par script ad hoc.
- Ajouter une dépendance sans la justifier dans le journal.
- Inventer un besoin métier : en cas de doute, poser la question ou consigner l'hypothèse.
