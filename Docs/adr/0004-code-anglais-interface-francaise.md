# ADR-0004 — Code en anglais, interface et documentation en français, glossaire figé

Date : 21/09/2026 · Statut : **Proposé** (à accepter par l'utilisateur)

## Contexte
Les utilisateurs et la documentation sont francophones. Les bibliothèques, conventions et la majorité du corpus des agents IA sont en anglais. Mélanger les deux dans le code (`getFacture`, `commandeStatus`) produit des incohérences ; traduire librement (`quote`/`estimate`, `order`/`command`) produit des malentendus.

## Décision
- Identifiants de code, noms de tables, messages de commit, commentaires : **anglais**.
- Interface utilisateur, messages affichés, documents PDF, exports Excel, documentation `Docs/`, journal, backlog, ADR : **français**.
- La correspondance des termes métier est **figée** dans `Docs/glossaire.md` (ex. Devis = `quote`, Commande = `order`, Facture = `invoice`, Avoir = `credit_note`, Magasinier = `warehouse`). Tout nouveau terme est ajouté au glossaire avant d'être utilisé dans le code.
- Les libellés français sont centralisés dans des fichiers de libellés du front, jamais codés en dur dans la logique.

## Conséquences
- Un agent qui rencontre un terme absent du glossaire doit le proposer et le documenter, pas improviser.
- Les tests citent les identifiants de règles (`RG-REM-04`) pour relier code anglais et spécification française.

## Alternatives écartées
- Code entièrement en français — friction avec les bibliothèques, accents et pluriels ambigus, moins bonne fluidité des agents.
- Code mixte sans glossaire — c'est l'état par défaut que cet ADR interdit.
