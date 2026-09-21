# Journal de bord

Entrées en ordre antichronologique (la plus récente en tête). Gabarit : `03-cdc-agent-ia.md` §5.1.

## 21/09/2026 — Création des cahiers des charges — agent : Claude Code (Opus 5)

**Fait** : dépôt git initialisé (aucun commit). Projet déplacé de `C:\Users\FUSZ\vente web` vers `F:\Documents\Programmation\Vente WEB` avec l'organisation demandée par l'utilisateur : `Source/` (code), `Dist/` (livrables, non versionné), `Docs/` (markdown), `Autres/` (documents fournis). Rédaction de `CLAUDE.md`, `AGENTS.md`, `Docs/README.md`, `Docs/glossaire.md`, `Docs/01-cdc-metier.md`, `Docs/02-cdc-technique.md`, `Docs/03-cdc-agent-ia.md`, ADR 0001 à 0004 (statut Proposé), `Docs/backlog.md`, ce journal.

Dépôt distant fourni par l'utilisateur : `https://github.com/Fusgith/vente_web.git` (vide), ajouté comme `origin` ; branche locale renommée `master` → `main`.

**Reste** : validation par l'utilisateur des hypothèses (H1–H13 métier, T1–T8 technique) et des ADR ; premier commit et push sur accord ; GO pour coder non donné.

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
