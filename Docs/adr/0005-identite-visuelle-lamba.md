# ADR-0005 — Identité visuelle « Lamba » et interface allégée

Date : 26/09/2026 · Statut : **Accepté** par l'utilisateur le 26/09/2026 (choix de la direction C parmi trois maquettes)

## Contexte
L'utilisateur a jugé la première interface « vraiment nulle et pas attractive » (25/09/2026). Trois directions ont été maquettées sur les écrans Connexion et Devis : A « Enseigne » (enseignes peintes), B « Billet » (billets d'Ariary), C « Lamba » (lamba hoany). L'utilisateur choisit C, en retenant les pastilles d'initiales **d'une couleur par rôle**, et trouve l'écran du devis **trop chargé**. Les tablettes 10" sont utilisées toute la journée, en paysage, dans un magasin lumineux.

## Décision
- **Un cadre « lamba »** entoure chaque écran : bandeau haut (nom de l'application, nom de l'espace de travail, utilisateur, rôle actif, déconnexion), liseré imprimé de grains de riz en chevrons, bandeau bas qui porte **la seule phrase d'état** de l'écran (« Ajouté : … », erreurs). La **couleur du cadre désigne l'espace de travail** ; son nom est toujours écrit aussi (la couleur n'est jamais le seul repère) :

  | Espace | Couleur |
  |---|---|
  | Connexion, Administration | Encre `#1B1E3F` |
  | Ventes | Indigo `#2B3A92` |
  | Caisse | Vert `#17693F` |
  | Livraison | Ardoise `#3E4C59` |
  | Supervision | Prune `#6A2C77` |
  | Tableau de bord | Ocre `#7A4A12` |

- **À l'intérieur du cadre, le calme** : fond Coton `#F1F3F6`, feuilles blanches, chiffres à l'encre. Trois sens de couleur seulement : Indigo = choisi ou action principale ; Safran clair `#FFF2CC` = en cours (ligne ou utilisateur en saisie) ; Garance `#B42318` = suppression et erreur.
- **Polices auto-hébergées** : Asap pour tout ce qui se lit et se touche (chiffres tabulaires, montants alignés à droite) ; Archivo, en chasse large, seulement pour le nom de l'application, les titres de volet et le bandeau d'état. Sous-ensemble latin uniquement.
- **Écran du devis allégé** : à gauche la recherche, puis soit les 12 plus vendus, soit les 8 résultats en lignes compactes (unité et prix seulement), soit le pavé de quantité ; à droite le tableau du devis avec le total toujours visible. Les catégories s'ouvrent dans une feuille (autant de catégories que le magasin en a), au lieu d'une rangée de boutons. Le disponible converti et le plafond par unité passent sur le pavé (RG-DEV-06 précisée).
- Cibles tactiles ≥ 48 px, aucun effet au survol seul, focus visible, contrastes AA au moins (7:1 sur les montants).
- L'icône ne porte **aucune lettre** : le nom de l'application est fixé à la construction (ADR-0006).

## Conséquences
- Chaque nouvel écran (caisse, livraison, supervision, tableau de bord, écran public, borne) reprend le cadre et ses jetons (`Source/apps/web/src/index.css`) ; pas de couleur hors palette.
- Deux dépendances de polices (`@fontsource/asap`, `@fontsource-variable/archivo`), justifiées au journal.
- Mode sombre non prévu pour l'instant (tablettes en plein jour).

## Alternatives écartées
- A « Enseigne » (aplats peints, lettrage d'enseigne) — non retenue par l'utilisateur.
- B « Billet » (encres de billet, guilloché) — non retenue par l'utilisateur.
- Garder l'interface d'origine — rejetée par l'utilisateur.
