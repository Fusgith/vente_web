# Cahier des charges AGENT IA — mémoire, contexte et méthode de travail

Version 0.1 — 21/09/2026 — Statut : **brouillon soumis à validation**

Ce document définit comment un agent de codage IA (Claude Code ou autre) travaille sur ce projet pour qu'**une session puisse reprendre exactement où la précédente s'est arrêtée**, sans explication orale, et sans que la mémoire du projet dépende d'un outil en particulier.

## 1. Principes

1. **Le dépôt est la mémoire.** Tout ce qu'un agent doit savoir est dans des fichiers versionnés : `CLAUDE.md`, `Docs/`, le code, l'historique git. La mémoire privée d'un outil (ex. la mémoire automatique de Claude Code) ne contient que des préférences de l'utilisateur, jamais des faits projet.
2. **Une information, un seul endroit.** Une règle métier vit dans le CDC métier ; une décision d'architecture dans un ADR ; l'état d'avancement dans le journal et le backlog. Les autres fichiers y renvoient, ils ne recopient pas.
3. **Court en haut, détaillé en bas.** `CLAUDE.md` tient en moins de 150 lignes et pointe vers le détail. Un agent lit d'abord ce qui est court, puis ouvre ce dont il a besoin.
4. **Écrire pour le prochain agent, pas pour soi.** Dates absolues (21/09/2026, jamais « hier »), chemins complets, identifiants de règles (`RG-REM-03`) et d'ADR plutôt que des paraphrases.
5. **Hypothèse ≠ décision.** Ce que l'utilisateur n'a pas tranché est marqué ⚠️ HYPOTHÈSE et listé dans la section dédiée du document concerné. Une hypothèse devient une décision quand l'utilisateur la valide (journal) ; elle est alors démarquée.
6. **Pas de code sans GO.** Règle absolue tant que `Docs/journal.md` ne contient pas l'entrée « GO donné le JJ/MM/AAAA ».

## 2. Fichiers de mémoire et leur rôle

| Fichier | Contenu | Quand le mettre à jour | Taille cible |
|---|---|---|---|
| `CLAUDE.md` | Mission, statut, ordre de lecture, invariants, protocole, stack, interdits | Rarement : changement de phase, de stack, de règle absolue | < 150 lignes |
| `Docs/journal.md` | Journal de bord : une entrée par session (fait, reste, décisions, questions) | **À chaque fin de session** | Entrée ≤ 30 lignes ; archiver les entrées > 3 mois dans `Docs/journal-archive/` |
| `Docs/backlog.md` | Tâches priorisées avec statut | À chaque changement de statut | Une ligne par tâche ; les tâches terminées depuis > 1 mois sont supprimées (git garde l'historique) |
| `Docs/01-cdc-metier.md` | Règles `RG-*`, process, rôles, hypothèses | Quand une règle change ou une hypothèse est validée | Sections numérotées stables |
| `Docs/02-cdc-technique.md` | Architecture, stack, modèle, déploiement | Quand un ADR est accepté | idem |
| `Docs/03-cdc-agent-ia.md` | Ce document | Quand la méthode change | idem |
| `Docs/adr/NNNN-titre.md` | Une décision, son contexte, ses conséquences | Jamais modifié après acceptation ; remplacé par un nouvel ADR | ≤ 60 lignes |
| `Docs/glossaire.md` | FR ↔ EN | Dès qu'un nouveau terme métier apparaît dans le code | |
| `Source/apps/*/CLAUDE.md` (après le GO) | Spécificités locales : commandes, structure, pièges | Quand la structure de l'app change | < 60 lignes |

## 3. Protocole de session

### 3.1 Début de session (obligatoire, dans cet ordre)

1. Lire `CLAUDE.md` en entier.
2. Lire la **dernière entrée** de `Docs/journal.md` (et les questions ouvertes qu'elle liste).
3. Lire `Docs/backlog.md` ; identifier la tâche « En cours » s'il y en a une, sinon la première « À faire » de la priorité la plus haute.
4. `git status` et `git log --oneline -10` : vérifier qu'aucun travail non commité n'est en suspens ; si oui, le signaler à l'utilisateur avant toute chose.
5. Annoncer à l'utilisateur, en 3 lignes : où on en est, ce qu'on propose de faire, ce qui attend sa décision.

### 3.2 Pendant la session

- **Une tâche à la fois.** Marquer la tâche « En cours » dans le backlog avant de commencer.
- **Lire avant d'écrire.** Ne jamais modifier un fichier sans l'avoir lu ; ne jamais supposer le contenu d'un fichier depuis une session précédente.
- **Ouvrir seulement ce qui est utile.** Pour une tâche sur les remises : `RG-REM-*`, le module de remise, ses tests. Pas tout le CDC.
- **Décision structurante** (choix de bibliothèque, changement de modèle de données, changement de flux) → écrire un ADR **avant** d'implémenter et le soumettre à l'utilisateur.
- **Question à l'utilisateur** : la poser au moment où elle bloque, pas en fin de session ; en attendant, avancer sur ce qui n'en dépend pas et consigner l'hypothèse retenue.
- **Règle métier ambiguë** : ne pas inventer ; proposer une formulation, la marquer ⚠️ HYPOTHÈSE dans le CDC métier.
- **Nouvelle dépendance** : la justifier en une ligne dans le journal (pourquoi, alternative écartée, taille).
- Vérification continue : lint, typecheck, tests ciblés après chaque changement significatif ; ne jamais dire « terminé » sans les avoir exécutés et sans citer le résultat.

### 3.3 Fin de session (obligatoire)

1. Exécuter la suite de tests complète (après le GO) et noter le résultat.
2. Mettre à jour `Docs/backlog.md` (statuts, nouvelles tâches découvertes).
3. Ajouter l'entrée du jour en **tête** de `Docs/journal.md` (gabarit §5).
4. Mettre à jour le CDC concerné si une règle ou une hypothèse a changé.
5. Committer (message conventionnel, §6.3) et pousser sur `origin/main`, sans solliciter l'utilisateur (accord permanent du 23/09/2026).
6. Résumer à l'utilisateur en 5 lignes maximum : fait, reste, décisions prises, questions ouvertes, prochain pas.

### 3.4 Interruption ou perte de contexte

Si la conversation est résumée ou interrompue, l'agent repart du journal et du backlog, jamais de sa mémoire de conversation. C'est pourquoi le journal est mis à jour **avant** de considérer une tâche terminée, pas seulement en fin de session sur les tâches longues (> 1 h de travail) : ajouter une ligne « point d'étape » à l'entrée du jour.

## 4. Gestion du contexte (fenêtre de travail de l'agent)

- **Budget** : un agent ne charge en contexte que `CLAUDE.md`, la dernière entrée du journal, le backlog et les fichiers directement liés à la tâche. Les CDC sont consultés par section (recherche d'un identifiant `RG-` ou d'un titre), pas lus intégralement à chaque session.
- **Fichiers courts** : aucun fichier de code > 400 lignes, aucun module sans responsabilité unique ; un agent qui doit lire 2 000 lignes pour comprendre une fonction est un signal de refactorisation.
- **Identifiants stables** : `RG-XXX-nn`, `ADR-nnnn`, `T-nnn` (tâches). Ils servent de liens entre code, tests, docs et journal : un test s'appelle `describe("RG-REM-04 …")`, un commit cite `T-042`.
- **Pas de duplication** : si un agent a besoin de répéter une règle dans un commentaire de code, il cite l'identifiant (`// RG-STK-06: stock never negative`) au lieu de la reformuler.
- **Sous-agents / travail parallèle** : un agent par application ou module, jamais deux agents sur le même fichier (copie de travail isolée si nécessaire) ; le journal indique quel agent travaille sur quoi. Intégration par l'agent principal après tests.
- **Ce qui ne va pas dans le contexte** : secrets, fichiers `.env`, exports de données réelles, dumps de base.

## 5. Gabarits

### 5.1 Entrée de journal (`Docs/journal.md`, en tête de fichier)

```markdown
## JJ/MM/AAAA — <titre court> — agent : <nom/outil>

**Fait** : T-012 import Excel : prévisualisation (RG-IMP-04) ; tests unitaires OK (14/14).
**Reste** : T-012 : mode INVENTAIRE ; T-013 non commencée.
**Décisions** : ADR-0005 accepté (bibliothèque Excel). Hypothèse H8 validée par l'utilisateur → RG-IMP-01 démarquée.
**Questions ouvertes** : format `.xls` ancien à supporter ? (bloque T-014)
**Prochain pas** : finir T-012 puis T-013.
```

### 5.2 ADR (`Docs/adr/NNNN-titre-court.md`)

```markdown
# ADR-NNNN — <titre>

Date : JJ/MM/AAAA · Statut : Proposé | Accepté | Remplacé par ADR-MMMM

## Contexte
<le problème, les contraintes, 5 lignes max>

## Décision
<ce qu'on fait, au présent, sans ambiguïté>

## Conséquences
<ce que ça impose, ce que ça interdit, ce que ça coûte>

## Alternatives écartées
- <alternative> — <pourquoi non>
```

### 5.3 Tâche du backlog (`Docs/backlog.md`)

```markdown
| T-042 | [MVP] | Paiement mixte (RG-PAY-02, RG-PAY-03) | À faire / En cours / Bloqué / Terminé | E05 | <note courte> |
```

## 6. Règles de code (applicables après le GO)

### 6.1 Structure et style

- TypeScript strict ; pas de `any` non justifié ; schémas zod comme source de vérité des types d'échange.
- Termes métier en anglais selon `Docs/glossaire.md` ; interface et messages en français dans des fichiers de libellés (pas de chaîne française codée en dur dans la logique).
- Règles pures dans `Source/packages/shared`, sans dépendance à la base ni au réseau.
- Un commentaire explique le **pourquoi** et cite la règle ; le **quoi** est porté par le nom.
- Les formats (MGA, dates) passent par les fonctions partagées ; toute reformulation locale est un défaut.

### 6.2 Tests

- Toute règle `RG-*` implémentée a un test qui la cite. Toute correction de bug commence par un test qui échoue.
- Les tests ne dépendent ni de l'heure réelle (horloge injectée) ni de données de production.
- Un test bout-en-bout couvre le parcours complet ; il est exécuté avant chaque mise en production.

### 6.3 Git

- Dépôt distant : `https://github.com/Fusgith/vente_web.git` (`origin`). Branche unique : `main`. L'utilisateur travaille seul avec l'agent : **ni branche de tâche ni pull request** ; git sert d'historique et de sauvegarde (décision de l'utilisateur, 23/09/2026).
- L'agent committe et pousse lui-même, sans solliciter l'utilisateur : un commit par tâche terminée ou par étape stable (tests verts). La CI tourne à chaque push ; l'agent la surveille et ne signale qu'un échec.
- Commits atomiques, message en anglais au format `type(scope): sujet — T-042` (`feat`, `fix`, `docs`, `test`, `refactor`, `chore`), corps expliquant le pourquoi si nécessaire ; dernière ligne : `Powered by Claude Opus` (pas de `Co-Authored-By` : l'agent est le moteur, pas l'auteur).
- Jamais de `--force` ni de réécriture de l'historique publié, jamais de commit de secrets.
- Les documents de `Docs/` sont commités avec le code qu'ils décrivent.

### 6.4 Definition of Done

Une tâche est « Terminée » quand : le code est écrit et relu ; les tests (unitaires + intégration + e2e concernés) passent ; lint et typecheck passent ; la règle `RG` est citée dans les tests ; la documentation impactée est à jour ; le journal mentionne la tâche ; l'utilisateur a validé si la tâche touche une règle métier ou une interface.

## 7. Interdits absolus

1. Coder avant le GO consigné dans le journal.
2. Modifier ou supprimer un ADR accepté (en écrire un nouveau qui le remplace).
3. Écrire directement dans une base de production, toucher aux séquences de numérotation ou au journal d'audit par script.
4. Déployer en production sans accord explicite ; forcer un push ou réécrire l'historique publié.
5. Ajouter une dépendance sans justification écrite.
6. Inventer une règle métier ou une valeur par défaut sans la marquer ⚠️ HYPOTHÈSE.
7. Déclarer une tâche terminée sans avoir exécuté les vérifications et cité leurs résultats.
8. Mettre des secrets, des données réelles ou des dumps dans le dépôt ou dans le contexte.

## 8. Outillage Claude Code spécifique (à créer au GO)

- `.claude/commands/debut-session.md` : exécute le protocole §3.1 et produit le résumé de 3 lignes.
- `.claude/commands/fin-session.md` : exécute le protocole §3.3 (tests, backlog, journal, commit et push).
- `.claude/commands/adr.md <titre>` : crée un ADR numéroté depuis le gabarit §5.2.
- `.claude/settings.json` : autorisations minimales (lecture/écriture dans le dépôt, `pnpm test`, `pnpm lint`, `docker compose` en dev) ; interdiction des commandes destructives.
- Mémoire automatique de Claude Code (`~/.claude/projects/<projet>/memory/`) : réservée aux préférences de l'utilisateur (langue, style de réponse) ; tout fait projet qui s'y trouverait doit être déplacé dans `Docs/`.
- Autres agents (Cursor, Codex, Gemini CLI…) : lire `CLAUDE.md` comme point d'entrée ; un fichier `AGENTS.md` à la racine renverra vers `CLAUDE.md` pour compatibilité.

## 9. Checklist « avant de dire terminé »

- [ ] Ai-je relu la règle `RG` concernée dans le CDC, pas de mémoire ?
- [ ] Les tests citent-ils la règle et passent-ils (résultat cité) ?
- [ ] Lint et typecheck OK ?
- [ ] Une hypothèse a-t-elle été prise ? Est-elle marquée et listée ?
- [ ] Le journal et le backlog sont-ils à jour ?
- [ ] Un ADR était-il nécessaire ? Est-il écrit et soumis ?
- [ ] Ai-je committé et poussé (message conventionnel, `Powered by Claude Opus`) et la CI est-elle verte ?
