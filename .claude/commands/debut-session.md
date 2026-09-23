Exécute le protocole de début de session de `Docs/03-cdc-agent-ia.md` §3.1, dans cet ordre :

1. Lis `CLAUDE.md` en entier.
2. Lis la dernière entrée de `Docs/journal.md` (la première du fichier) et ses questions ouvertes.
3. Lis `Docs/backlog.md` ; repère la tâche « En cours », sinon la première « À faire » du lot le plus prioritaire.
4. Exécute `git status` et `git log --oneline -10` ; signale tout travail non commité avant toute chose.
5. Annonce en 3 lignes : où on en est, ce que tu proposes de faire, ce qui attend une décision de l'utilisateur.

Ne commence aucune tâche avant l'accord de l'utilisateur. Une seule tâche « En cours » à la fois, directement sur `main` (ni branche ni PR).
