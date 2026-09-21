# Journal de bord

Entrées en ordre antichronologique (la plus récente en tête). Gabarit : `03-cdc-agent-ia.md` §5.1.

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
