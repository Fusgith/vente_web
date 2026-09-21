# Documentation du projet Vente Web

| Fichier | Rôle | Qui le modifie |
|---|---|---|
| `../CLAUDE.md` | Point d'entrée de tout agent IA (règles, ordre de lecture) | Agent + utilisateur |
| `01-cdc-metier.md` | Cahier des charges métier : process, rôles, règles de gestion `RG-*` | Utilisateur (validation), agent (rédaction) |
| `02-cdc-technique.md` | Cahier des charges technique : architecture, stack, modèle de données, déploiement | Agent, validé par l'utilisateur |
| `03-cdc-agent-ia.md` | Gestion de la mémoire et du contexte des agents de codage IA | Agent |
| `glossaire.md` | Vocabulaire métier FR ↔ EN (obligatoire pour nommer le code) | Agent |
| `adr/` | Décisions d'architecture, une par fichier, jamais modifiées après acceptation | Agent |
| `backlog.md` | Travail à faire, priorisé | Agent + utilisateur |
| `journal.md` | Journal de bord des sessions (mémoire longue durée) | Agent, à chaque fin de session |

Conventions :
- `⚠️ HYPOTHÈSE` = choix fait par l'agent faute de réponse ; à confirmer par l'utilisateur.
- `[MVP]` / `[V1.1]` / `[V2]` = priorité de livraison.
- Les règles `RG-XXX-nn` ne sont jamais renumérotées ; une règle abandonnée est marquée « (abrogée, voir RG-…) ».
