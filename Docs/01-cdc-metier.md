# Cahier des charges MÉTIER — Vente Web

Version 0.8 — 28/09/2026 — Statut : **hypothèses H1–H13 et H18 tranchées par l'utilisateur le 21/09/2026** (§16), **corrections du 23/09/2026** (§16.3), **décisions du 25/09/2026** (§16.4, dont H22), **décisions du 26/09/2026** (§16.5 : H14 à H28) ; ADR 0001–0006 acceptés , **décision du 27/09/2026** (§16.6 : H29), **décisions du 28/09/2026** (§16.7 : H30 à H33, perte de la priorité) ; point à confirmer : H34 (livraison, T-060).

Nouveautés v0.8 : contrôle à la caisse validé (H30, RG-CMD-05b) ; **un client absent perd sa priorité**, de même qu'une commande prioritaire placée en dernier par le responsable (RG-FIL-02, RG-FIL-04).

Nouveautés v0.7 : toutes les hypothèses ouvertes tranchées (§16.5) ; **plafonds de remise fixés par le boss seul** (RG-REM-01) ; **mot de passe du boss choisi par lui seul**, avec un code d'activation (RG-USR-10) ; **une seule session par personne**, et un poste déclaré pour toute connexion dans le magasin (RG-USR-09) ; **deux téléphones au plus par client** (RG-DEV-04) ; devis daté du jour de sa **création** (RG-FAC-06).

Nouveautés v0.6 : écran du devis allégé — le disponible converti et le plafond de chaque unité s'affichent sur le pavé de quantité, les catégories s'ouvrent en grosses tuiles quel que soit leur nombre (RG-DEV-06, ADR-0005) ; **nom de l'application fixé avant la distribution** (RG-APP-01, ADR-0006).

Nouveautés v0.5 : remise **sur chaque ligne et/ou sur le total** du devis, toujours saisissable **en % ou directement en montant** (RG-REM-06) ; demande au boss et code de remise **ligne par ligne**, un % ou un montant chacun (H22 tranchée) ; **recherche et saisie rapides** des articles, sans jamais faire défiler le catalogue (RG-DEV-06) ; **borne de commande en libre-service** où le client compose lui-même son panier (§5.10).

Nouveautés v0.4 : **remise uniquement ligne par ligne**, produit par produit (plus de remise globale sur le total, RG-REM-06) ; montants affichés avec le sigle **MGA** — « Ariary » en toutes lettres, jamais « Ar » (RG-FMT-01) ; devis, commande et facture présentés en **tableau** (RG-DEV-05).

Nouveautés v0.3 : **grille de prix par unité de vente** (article stocké dans une unité de base, vendu dans une ou plusieurs unités avec facteur de conversion et prix propre), **historique des prix** avec date d'effet, import « une ligne par couple article × unité ».

## 0. Comment lire ce document

- Les règles de gestion sont numérotées `RG-XXX-nn`. Elles font foi pour le code et les tests ; chaque règle doit être couverte par au moins un test automatisé une fois le développement lancé.
- `⚠️ HYPOTHÈSE` : choix fait par le consultant faute de réponse, à confirmer ou corriger. Toutes sont récapitulées au §16 (les hypothèses tranchées y restent, avec la décision).
- Priorité : **[MVP]** indispensable pour la première mise en service · **[V1.1]** peu après · **[V2]** plus tard.
- Vocabulaire : voir `glossaire.md`.

## 1. Contexte et objectifs

Magasin de marchandise générale à Madagascar. Vente au comptoir assistée : un **commercial** accompagne le client avec une tablette, la **caisse** encaisse, un **magasinier** remet la marchandise, le **boss** suit l'activité à distance.

Problèmes visés :

1. Files d'attente à la caisse et à la livraison.
2. Remises accordées sans règle ni trace.
3. Aucune visibilité en temps réel pour le boss (encaissements du jour, quantités vendues).
4. Stock connu approximativement → promesses de vente sur des articles indisponibles.
5. Pas de traçabilité : qui a fait quoi, quand.

Objectifs mesurables :

| Objectif | Indicateur |
|---|---|
| Plus de file physique | 100 % des clients ont un numéro d'appel ; temps d'attente moyen mesuré et affiché au responsable |
| Remises maîtrisées | 100 % des remises tracées ; 0 remise au-delà des plafonds sans code du boss |
| Boss informé | Encaissements et quantités consultables à distance par heure, jour, semaine, mois, à jour à quelques secondes près |
| Zéro ressaisie | Facture générée automatiquement à chaque paiement |
| Continuité | Le magasin vend même sans Internet |

## 2. Périmètre

### 2.1 Dans le périmètre

- Catalogue d'articles alimenté par import Excel (code unique, catégorie, désignation, unité de comptage, quantité, date d'entrée) ; **grille de prix par unité de vente** (pièce, paquet, carton… avec facteur de conversion) et **historique des prix** ; stock théorique tenu dans l'unité de base (entrées par import, sorties par livraison, ajustements motivés).
- Parcours de vente complet : devis → commande → file caisse → paiement → facture → file livraison → remise de la marchandise.
- Remises **paramétrées d'avance** (plafond par article ou catégorie), sur les lignes et sur le total, en % ou en montant ; remise exceptionnelle uniquement sur **code délivré par le boss**.
- Recherche et saisie rapides des articles sur la tablette (champ unique, code, scan du code-barres, favoris) ; **borne de commande en libre-service** dans le magasin, où le client compose lui-même son panier, repris ensuite par un commercial (§5.10).
- Appel des clients par numéro : écran public (optionnel) ou appel verbal ; réordonnancement par le responsable.
- Clients identifiés (nom + contact obligatoires) ; répertoire clients simple.
- Tous moyens de paiement, y compris mixte.
- Factures, devis, avoirs, bons de livraison en PDF ; exports Excel.
- Sessions et clôtures de caisse.
- Tableau de bord du boss (encaissements, quantités vendues, files en direct) par heure / jour / semaine / mois, accessible à distance ; notification des demandes de remise exceptionnelle.
- Journal d'audit complet.
- Six rôles + écran public ; nombre de postes (tablettes, caisses, comptoirs) libre et paramétrable.

### 2.2 Hors périmètre (explicitement)

- Gestion des achats, fournisseurs, commandes de réapprovisionnement.
- Trésorerie (dépenses, banque, soldes), comptabilité, paie.
- E-commerce, vente en ligne, réservation par le client (la borne libre-service du §5.10 est dans le magasin et ne réserve rien : son panier est repris par un commercial).
- Multi-magasins **[V2]** (un seul magasin en V1, décision H1 ; plusieurs magasiniers et plusieurs comptoirs dans ce magasin), programme de fidélité avancé **[V2]**, articles à variantes (taille/couleur) **[V2]**.

> Clarification « ce n'est pas une appli de gestion de stock » : l'application tient malgré tout un **stock théorique fiable**, sinon elle ne peut pas dire au commercial ce qui est disponible. Les seules entrées sont les imports Excel ; les seules sorties sont les livraisons ; le responsable peut corriger un écart par un ajustement motivé. Rien de plus.

## 3. Acteurs et rôles

### 3.1 Les rôles

| Rôle | Où | Mission | Appareil type |
|---|---|---|---|
| **Commercial** | Surface de vente | Conseiller, identifier le client, construire le devis, appliquer les remises dans les plafonds, demander une remise exceptionnelle au boss si besoin, valider la commande, remettre le numéro d'appel | Tablette Android 10" |
| **Caissier** | Caisse | Appeler, contrôler la commande, saisir un code de remise du boss le cas échéant, encaisser, émettre la facture, clôturer sa caisse | PC ou tablette + imprimante |
| **Magasinier** | Comptoir livraison / réserve (plusieurs magasiniers, chacun sur un comptoir) | Préparer, appeler, remettre la marchandise, signaler les anomalies | Tablette ou PC |
| **Responsable** | Magasin | Importer les articles, superviser les files en direct et les réordonner, ajuster le stock, valider les annulations après paiement et les clôtures | PC + tablette |
| **Boss** | Partout (à distance) | Suivre le tableau de bord (horaire, journalier, hebdomadaire, mensuel) ; recevoir les demandes de remise exceptionnelle et délivrer les codes de remise ; fixer les plafonds de remise (décision H15) ; tout le reste en lecture | Téléphone, PC |
| **Admin** | Magasin / à distance | Créer et désactiver les comptes, attribuer les rôles, déclarer les postes, gérer les paramètres, exécuter les corrections assistées, superviser sauvegardes et restauration | PC |
| **Écran public** | Mur du magasin (optionnel) | Afficher les numéros appelés (pas un utilisateur : un poste sans compte). Sans écran, l'appel est verbal (RG-DSP-05) | TV + mini-PC/Chromecast |
| **Borne libre-service** | Surface de vente (optionnelle, nombre libre) | Laisser le client composer lui-même son panier, repris ensuite par un commercial (pas un utilisateur : un poste sans compte, §5.10) | Tablette 10" ou écran tactile fixe |

### 3.2 Règles sur les rôles

- **RG-USR-01** Les six rôles sont fixes. L'admin crée des comptes et leur attribue un ou plusieurs rôles ; il ne crée pas de rôles. *(Un rôle dynamique impose une matrice de droits configurable, source de bugs et d'erreurs de manipulation.)*
- **RG-USR-02** Un utilisateur peut cumuler plusieurs rôles (ex. responsable + caissier). Il choisit son rôle actif à la connexion ou via un sélecteur ; le rôle actif est enregistré dans chaque action journalisée.
- **RG-USR-03** Connexion sur poste partagé (tablette, caisse) par **PIN** à 4–6 chiffres, après choix de son nom ; mot de passe complet pour l'accès à distance. Verrouillage automatique après inactivité (paramètre, défaut 5 min sur tablette, 15 min à la caisse).
- **RG-USR-04** Boss et admin : double authentification (code à usage unique) obligatoire pour tout accès depuis l'extérieur du magasin.
- **RG-USR-05** Blocage du compte 15 min après 5 tentatives échouées ; événement journalisé.
- **RG-USR-06** Un compte ne se supprime jamais, il se désactive (l'historique doit rester lisible).
- **RG-USR-07** Chaque commercial porte une **lettre de ticket** unique (paramètre du compte), voir RG-TKT-01. *(Décision H2.)*
- **RG-USR-08** Plusieurs magasiniers travaillent en même temps, chacun connecté sur son comptoir (poste). Une commande en préparation est prise en charge par **un seul** magasinier ; les autres voient qui l'a ; le responsable peut la réaffecter. *(Décision H1.)*
- **RG-USR-09 Une session par personne.** Un utilisateur n'a qu'une session ouverte : se connecter ailleurs ferme la précédente, et cette fin est journalisée. Dans le magasin, toute connexion se fait depuis un **poste déclaré** (§13 `stations`), compatible avec le rôle ; à distance (boss, admin), sans poste. *(Décision H21, 26/09/2026 ; le poste devient obligatoire avec l'appairage des postes, T-015.)*
- **RG-USR-10 Mot de passe du boss.** Seul le boss connaît et choisit son mot de passe : l'admin ne le pose ni ne le réinitialise. Pour un premier mot de passe ou après un oubli, l'admin génère un **code d'activation** à usage unique, valable 24 h, qu'il remet au boss ; le boss choisit alors lui-même son mot de passe. Génération et utilisation du code sont journalisées. *(Décision H20, 26/09/2026.)*

### 3.3 Ce que l'admin ne fait pas (choix volontaire)

- Pas d'écriture directe en base de données. Toute correction passe par des **écrans de correction assistée** qui produisent des mouvements compensatoires journalisés (RG-AUD-03).
- Pas de suppression de factures, paiements ou mouvements. Une erreur se corrige par un avoir ou un ajustement.
- La **remise à zéro** de la base n'est possible que sur un environnement non productif ou avant la mise en service, avec sauvegarde préalable automatique et double confirmation.

La matrice détaillée des droits est en **annexe B**.

## 4. Objets métier

| Objet | Description | Attributs clés |
|---|---|---|
| Article | Marchandise vendable | **code** (unique), désignation, catégorie, **unité de base** (unité de comptage du stock), remise max %, seuil d'alerte, code-barres, actif, date de dernière entrée |
| Unité de vente | Conditionnement dans lequel l'article se vend (grille de prix) | article, libellé (pièce, paquet, carton, kg…), **facteur** (nombre d'unités de base ; 1 pour l'unité de base), prix en vigueur, remise max % (surcharge facultative), actif |
| Prix | Une valeur de prix d'une unité de vente, historisée | unité de vente, montant, **date d'effet**, date de fin (vide = en vigueur), origine (import n°… / saisie), auteur, date de saisie |
| Catégorie | Regroupement d'articles | nom, remise max % par défaut |
| Stock | État quantitatif d'un article, **en unité de base** | théorique, réservé, disponible |
| Mouvement de stock | Entrée/sortie tracée | type (IMPORT, AJUSTEMENT, LIVRAISON, RETOUR), quantité signée, référence d'origine, auteur, motif, date, date d'entrée (import) |
| Import | Un fichier Excel traité | fichier, mode, auteur, date d'import, date d'entrée, statut (PRÉVISUALISÉ, VALIDÉ, ANNULÉ), lignes OK / en erreur, résumé |
| Client | **Obligatoire** sur devis et commande | nom, téléphone (contact), notes |
| Devis / Commande | Même objet, états différents | numéro, état, commercial, client, ticket, origine (commercial ou borne, §5.10), lignes (chacune avec sa remise éventuelle), remise éventuelle sur le total (RG-REM-06), totaux, code de remise éventuel, horodatages de chaque étape |
| Ligne | Article dans une commande | code et désignation figés, **unité de vente et facteur figés**, quantité (dans l'unité de vente), quantité en unité de base, prix unitaire figé, remise de la ligne, part de la remise sur le total (RG-REM-06), origine de la remise (plafond / code) |
| Ticket d'appel | Numéro du client | lettre, numéro du jour, date |
| Demande de remise exceptionnelle | Demande adressée au boss | commande, client, demandeur, lignes concernées et/ou total, avec le % ou le montant demandé pour chacun (décision H22), motif, décision (accordée / refusée / modifiée), décideur, date |
| Code de remise | Autorisation du boss, à usage unique | code, lignes ou articles couverts et/ou total, avec le % ou le montant accordé pour chacun (décision H22), commande ou client visé, émis par, date, expiration, statut (ACTIF, UTILISÉ, EXPIRÉ, RÉVOQUÉ) |
| Session de caisse | Période d'encaissement | caisse, caissier, ouverture, fond de caisse, clôture, comptage, écarts |
| Paiement | Règlement d'une commande | lignes (moyen, montant, référence), reçu, rendu, session de caisse |
| Facture | Document légal | numéro, date, contenu figé, PDF, statut |
| Avoir | Annulation totale/partielle | numéro, facture d'origine, montant, motif, remboursement |
| Livraison | Remise physique | magasinier, comptoir, horodatages, anomalies |
| Poste | Point physique déclaré | type (tablette, caisse, comptoir, écran, borne), nom, actif |
| Journal d'audit | Trace immuable | qui, rôle, poste, quand, action, objet, avant, après, motif |
| Paramètres | Configuration | voir §13 |

## 5. Processus de vente

### 5.1 Vue d'ensemble

```
   COMMERCIAL                     CAISSE                        LIVRAISON
   ──────────                     ──────                        ─────────
   Client (nom + contact)
   Devis (brouillon)  ◄── panier de la borne (§5.10)
   remises ligne / total ≤ plafond : libres
   > plafond : demande au boss ──► code
        │ valider
        ▼
   Commande validée ──────►  File CAISSE (rang, écran ou appel verbal)
   ticket A15                     │ appeler A15 → « A15 → Caisse 2 »
   stock réservé jusqu'à          ▼
   la fin de la journée      Contrôle : lignes, remises (plafond ou code)
                                  │ encaisser (moyens multiples)
                                  ▼
                             Payée + FACTURE F-2026-000123 ─────►  File LIVRAISON
                             réservation ferme                         │ préparer
                                                                       ▼
                                                                  Prête → appel « A15 → Comptoir 1 »
                                                                       │ remettre
                                                                       ▼
                                                                  Livrée = sortie de stock
```

### 5.2 États d'une commande

| État (FR) | Code | Signification | Sorties possibles |
|---|---|---|---|
| Devis | `DRAFT` | Brouillon, non engageant, pas de réservation | Validée · Abandonné |
| Validée (en file caisse) | `SUBMITTED` | Ticket attribué, stock réservé jusqu'à la fin de la journée | Appelée caisse · Expirée · Annulée |
| Appelée à la caisse | `AT_REGISTER` | Affichée sur l'écran public (ou appelée verbalement), en cours de contrôle | Payée · Retour en file (absent) · Annulée |
| Payée (à livrer) | `PAID` | Facture émise, réservation ferme | En préparation · Annulée après paiement |
| En préparation | `PREPARING` | Prise en charge par un magasinier | Prête · Anomalie · Retour en file (réaffectation, ⚠️ H34) |
| Prête (appelée livraison) | `READY` | Appelée côté livraison | Livrée · Retour en file (absent ou réaffectation, ⚠️ H34) · Anomalie |
| Anomalie | `ISSUE` | Article manquant ou abîmé, décision du responsable attendue | Prête · Livrée partiellement + avoir |
| Livrée | `DELIVERED` | Marchandise remise, stock sorti — **état final** | Retour [V1.1] |
| Expirée | `EXPIRED` | Non payée à la fin de la journée, réservation libérée | Réactivée (→ Validée) |
| Annulée | `CANCELLED` | Annulée avant paiement — final | — |
| Annulée après paiement | `REFUNDED` | Avoir émis — final | — |

- **RG-CMD-06** Seules les transitions du tableau sont autorisées ; toute transition est horodatée, avec son auteur, et journalisée.

### 5.3 Étape 1 — Conseil et devis (commercial)

1. Le commercial ouvre un nouveau devis et **identifie le client** : recherche dans le répertoire par téléphone ou nom ; sinon création en deux champs (nom, téléphone). *(Décision H12.)*
2. Il trouve les articles **sans faire défiler de liste** (RG-DEV-06) : un champ unique où il tape un code, quelques lettres de la désignation ou scanne un code-barres avec la caméra de la tablette ; favoris en un geste. Il voit pour chaque article : les **unités de vente** avec leur prix (ex. « pièce 4 500 MGA · carton de 12 : 50 000 MGA »), le **stock disponible** (en unité de base, et converti dans l'unité choisie), la **remise max autorisée**.
3. Il ajoute des lignes en choisissant l'**unité de vente**, ajuste les quantités, saisit éventuellement une **remise sur chaque ligne** et/ou une **remise sur le total**, en % ou directement en montant (RG-REM-06), **dans la limite des plafonds** ; l'interface affiche le maximum possible et refuse toute saisie au-delà. Le devis s'affiche en tableau (RG-DEV-05). Si le client demande davantage, le commercial envoie une **demande de remise exceptionnelle au boss** (RG-REM-03) ou saisit un **code de remise** déjà reçu du boss (RG-REM-04).
4. Il peut enregistrer le devis (client qui réfléchit), l'imprimer/l'envoyer en PDF, et le reprendre plus tard.

Règles :

- **RG-DEV-01** Un devis ne réserve pas de stock et n'a pas de ticket.
- **RG-DEV-02** Numérotation `D-AAAA-nnnnnn` (trous tolérés). Validité : paramètre, défaut 7 jours ; au-delà, reprise possible avec revalorisation des prix et re-contrôle des disponibilités.
- **RG-DEV-03** Un devis peut être repris par un autre commercial (le devis reste rattaché à son créateur ; la commande porte le commercial qui valide).
- **RG-DEV-04** Le client est **obligatoire** : nom + téléphone, et un **second téléphone** facultatif (deux au plus). Un numéro n'appartient qu'à un seul client actif, qu'il y soit le premier ou le second : le répertoire détecte un téléphone déjà connu et propose la fiche existante ; la recherche par téléphone trouve les deux numéros. Le premier téléphone figure sur les devis et les factures. Un client ne se supprime pas ; il se fusionne ou se désactive (responsable). *(Décision H12 ; format du téléphone et fusion : décision H26, 26/09/2026.)*
- **RG-DEV-05 Présentation en tableau.** *(Décision de l'utilisateur, 23/09/2026.)* Le devis — comme la commande et la facture (RG-FAC-02) — se présente en **tableau**, une ligne par article × unité de vente, jamais en texte libre du type « 2 × Riz, sac 50 kg ». Colonnes (libellés confirmés par l'utilisateur le 25/09/2026) : **N°** · **Désignation** (code et libellé de l'article) · **Quantité** · **Unité** (unité de vente, avec l'équivalence en unité de base si elle diffère, RG-ART-04 : « carton (× 12 pièces) ») · **Prix unitaire** · **Remise** (% et montant, RG-REM-06) · **Montant net** (quantité × prix unitaire − remise) ; les trois colonnes de montants portent « (MGA) » dans leur en-tête, leurs cellules le nombre seul (RG-FMT-01). Sous le tableau : **total brut**, **remises sur les lignes**, **sous-total**, [**remise sur le total**, avec son % s'il a été saisi en %, RG-REM-06], [HT / TVA / TTC si TVA active], [arrondi espèces, facture seulement, RG-FMT-04], **net à payer**, et le rappel du **total des remises** (lignes + total). Même présentation à l'écran de la tablette et sur le PDF A4 ; le ticket 80 mm **[V1.1]** reprend les mêmes informations dans le même ordre, sa mise en page étant définie avec lui. **Calcul** (RG-FMT-01) : le montant brut de la ligne (quantité × prix unitaire) est arrondi à 2 décimales ; une remise saisie en % devient un montant arrondi à 2 décimales sur ce brut ; montant net = brut − remise ; total brut, remises sur les lignes et sous-total sont les sommes de ces valeurs, sans nouvel arrondi ; une remise sur le total saisie en % devient un montant arrondi à 2 décimales sur le sous-total ; net à payer = sous-total − remise sur le total : le tableau et ses totaux concordent toujours.
- **RG-DEV-06 Recherche et saisie rapides.** *(Demande de l'utilisateur, 25/09/2026 ; solution laissée au choix de l'agent.)* Le commercial ne fait **jamais défiler** le catalogue pour trouver un article :
  1. **Un seul champ de recherche**, toujours visible en haut de l'écran du devis, accepte indifféremment un code article, un code-barres ou des mots de la désignation. Les résultats s'affichent dès le 2ᵉ caractère, sans tenir compte des majuscules ni des accents, mots dans n'importe quel ordre, début de mot suffisant (« riz 50 » trouve « Riz blanc, sac 50 kg ») ; au plus **8 résultats**, visibles sans défilement, les meilleurs d'abord (code exact, puis début de code, puis désignation) ; au-delà, « Précisez la recherche ».
  2. **Code exact ou code-barres** — tapé, scanné ou reçu d'une douchette Bluetooth/USB — : la ligne est **ajoutée directement**, sans liste, dans l'unité de vente du code-barres (RG-ART-06) ou, pour un code article, dans l'unité de base si elle est vendable, sinon dans la plus petite unité active.
  3. **Scan en rafale** avec la caméra de la tablette : chaque article reconnu est ajouté avec un bip et une vibration ; le même article scanné à nouveau augmente sa quantité de 1.
  4. **Quantité en tête** : « 12*SAV-001 » (ou « 12 x SAV-001 ») ajoute 12 unités d'un coup ; si le texte après la quantité n'est pas un code exact, la liste s'affiche et l'article choisi reçoit cette quantité. Après chaque ajout, la quantité de la nouvelle ligne est sélectionnée avec un **pavé numérique** à gros boutons ; l'unité se choisit par **boutons** (pièce · paquet · carton), jamais par liste déroulante.
  5. **Favoris** : une rangée des 12 articles les plus vendus par ce commercial sur 30 jours (à défaut, du magasin), ajoutables d'un geste ; les catégories servent de filtre facultatif.

  Chaque résultat affiche ses unités de vente avec leur prix, le disponible en unité de base et le plafond de remise, donné une seule fois par article (fourchette si les unités diffèrent) ; le **disponible converti** dans chaque unité et le **plafond propre à chaque unité** s'affichent sur le pavé de quantité, là où l'unité se choisit (§5.3). Les catégories s'ouvrent dans une feuille à grosses tuiles, quel que soit leur nombre ; l'écran du devis reste allégé (ADR-0005, *demande de l'utilisateur du 26/09/2026*). Temps de réponse visé : moins de 300 ms sur le réseau du magasin, jusqu'à 50 000 articles (§14).

### 5.4 Étape 2 — Validation de la commande (commercial)

- **RG-CMD-01** Une commande a un commercial responsable (celui qui valide). Le responsable peut la réaffecter.
- **RG-CMD-02** La validation n'est possible que si, pour chaque ligne, `disponible ≥ quantité × facteur` (contrôle en **unité de base**, RG-ART-06 ; toutes les lignes d'un même article se cumulent), le **disponible** déduisant toutes les commandes validées non encore livrées — en file caisse, appelées, payées non livrées, en préparation (RG-STK-01). Un commercial ne peut donc pas vendre un article déjà engagé par une commande qui attend à la caisse. Sinon, message précis par ligne (« Code X : 3 disponibles, 5 demandés ») et proposition de réduire la quantité. *(Décision H6.)*
- **RG-CMD-03** À la validation, dans une seule opération indivisible : numéro de commande, ticket d'appel (RG-TKT), réservation de stock (RG-STK-02), entrée en file caisse (RG-FIL-01), notification des caisses.
- **RG-CMD-04** Les prix unitaires, désignations, unités de vente et facteurs sont **figés** à la validation (la ligne référence le prix historisé qui était en vigueur, RG-ART-07). Un changement ultérieur du prix ou de la grille de l'article n'affecte pas la commande.
- **RG-CMD-05** Le commercial communique le ticket au client (affiché en gros sur la tablette ; impression d'un mini-ticket **[V1.1]**).
- **RG-CMD-07** Une commande peut être validée avec une demande de remise exceptionnelle **en attente** ; la remise demandée n'est pas appliquée tant qu'un code valide n'est pas rattaché (RG-REM-05). La caisse voit l'état de la demande.

### 5.5 Étape 3 — File d'attente caisse et appel

- **RG-FIL-01** Deux files : **CAISSE** (commandes `SUBMITTED`) et **LIVRAISON** (commandes `PAID`, `PREPARING`, `READY`). Ordre par défaut : ordre d'entrée dans la file.
- **RG-FIL-02** Le **responsable** peut réordonner (rang), marquer prioritaire, retirer ou réaffecter ; chaque modification est journalisée avec motif facultatif. Une commande prioritaire qu'il place **en dernière position** perd sa priorité (décision du 28/09/2026) ; le journal garde la position et la priorité avant → après.
- **RG-FIL-03** *(Modalités : décision H29, 27/09/2026.)* Le caissier appelle en priorité le premier de la file ; il peut appeler un ticket précis si le client est devant lui (journalisé). L'appel affiche « A15 → Caisse 2 » sur l'écran public s'il existe (RG-DSP-01), sinon le caissier appelle verbalement le ticket et le nom du client (RG-DSP-05) ; la commande passe en `AT_REGISTER`.
- **RG-FIL-04** Client absent : le caissier clique « Absent » ; la commande revient en file **en dernière position** avec un compteur d'absences ; la réservation continue de courir (RG-STK-02). Une commande prioritaire **perd sa priorité** (RG-FIL-02, décision du 28/09/2026), changement journalisé avant → après. Après 2 absences, le responsable est notifié.
- **RG-FIL-05** Le temps d'attente (entrée en file → appel) et le temps de traitement (appel → paiement) sont conservés pour les statistiques.
- **RG-FIL-06** Les mêmes règles s'appliquent à la file LIVRAISON (appel par le magasinier, absence, réordonnancement), avec autant de comptoirs que déclarés.

### 5.6 Étape 4 — Contrôle et paiement (caissier)

1. Le caissier voit la commande : client, lignes, prix, remises avec leur origine (« dans le plafond » ou « code boss n° … », ou « demande au boss en attente »).
2. Il peut **modifier avant paiement** : supprimer une ligne, réduire une quantité, saisir un code de remise (RG-CMD-05b). Toute modification est journalisée avec l'état avant/après.
3. Il **ne décide d'aucune remise** : les plafonds sont appliqués par l'application, les dépassements n'existent que par code du boss. *(Décision H4.)*
4. Il enregistre le paiement : un ou plusieurs moyens (RG-PAY).
5. Le paiement complet **génère la facture** (RG-FAC-01) et notifie la livraison.

- **RG-CMD-05b** *(Modalités : décision H30, 28/09/2026.)* Modifications autorisées à la caisse avant paiement : suppression de ligne, baisse de quantité, saisie d'un code de remise, retrait d'une remise non couverte (avec l'accord du client). Un ajout d'article ou un changement de remise dans le plafond passe par le commercial (renvoi en un clic, la commande garde son ticket).

### 5.7 Étape 5 — Facture

Voir RG-FAC. La facture est produite en PDF, imprimable en A4 et, en option, en format ticket 80 mm **[V1.1]**.

### 5.8 Étape 6 — Préparation et livraison (magasinier)

- *(Modalités de RG-LIV-01 à 03 : ⚠️ HYPOTHÈSE H34.)*
- **RG-LIV-01** Dès le paiement, la commande entre dans la file LIVRAISON ; les comptoirs sont notifiés (son + visuel).
- **RG-LIV-02** Un magasinier prend en charge (`PREPARING`, verrou à son nom, RG-USR-08), prépare, puis déclare **prête** : le ticket est appelé sur l'écran public (« A15 → Comptoir 1 ») ou verbalement.
- **RG-LIV-03** À la remise, il confirme la livraison ligne par ligne (case à cocher) : la commande passe `DELIVERED` et la **sortie de stock** est enregistrée (RG-STK-04).
- **RG-LIV-04** Anomalie (article manquant, abîmé) : le magasinier signale ; état `ISSUE` ; le responsable décide : livraison partielle + avoir sur le manquant (RG-ANN-03), ou attente. La facture d'origine n'est jamais modifiée.
- **RG-LIV-05** Livraison différée : une commande payée peut rester « à livrer » (client qui revient plus tard) sans limite, avec réservation ferme. Le responsable et le boss voient la liste « payé non livré ».
- **RG-LIV-06** Bon de livraison PDF distinct **[V1.1]** ; en MVP, la facture tient lieu de bon de livraison, tamponnée ou signée physiquement si le magasin le souhaite.

### 5.9 Cas particuliers

- **RG-CMD-08 Expiration** *(modalités : décision H31, 28/09/2026)* : une commande `SUBMITTED` non payée à la **fin de la journée** (RG-STK-02) passe `EXPIRED` ; le stock est libéré ; le commercial est notifié. Le commercial peut la **réactiver** le lendemain ou plus tard : nouveau contrôle de stock, nouveau ticket (le jour a changé), nouvelle échéance en fin de journée.
- **RG-ANN-01 Annulation avant paiement** : par le commercial (ses commandes), le caissier ou le responsable, motif obligatoire ; réservation libérée ; ticket clos.
- **RG-ANN-02 Annulation après paiement, avant livraison** : par le caissier **avec validation du responsable** ; émet un **avoir total**, enregistre le remboursement (moyen, référence), libère la réservation ; état `REFUNDED`.
- **RG-ANN-03 Avoir partiel** : suite à une anomalie de livraison, avoir sur les lignes ou quantités non livrées ; la sortie de stock ne porte que sur le livré.
- **RG-ANN-04 Retour après livraison [V1.1]** : le magasinier enregistre le retour (article, quantité, état) ; le responsable valide ; avoir + réintégration en stock si l'article est revendable, sinon mouvement « rebut » motivé.
- **RG-ANN-05** Une facture ne se supprime ni ne se modifie jamais ; l'avoir est le seul mécanisme de correction.

### 5.10 Commande en libre-service (borne)

*(Demande de l'utilisateur, 25/09/2026 ; modalités : décision H24, 26/09/2026.)* Le client compose lui-même son panier sur une **borne** du magasin (tablette ou écran tactile fixe) ; un commercial le reprend pour en faire une commande. Ce n'est pas de la vente en ligne (§2.2) : la borne est dans le magasin et ne réserve rien.

- **RG-BOR-01 Poste sans compte.** Une borne est un poste de type « borne » déclaré par l'admin (§13 `stations`), connecté par une **clé de poste** comme l'écran public (RG-DSP-03), sans compte utilisateur. Elle n'accède qu'au catalogue des articles vendables — désignation, unités de vente, prix en vigueur, « disponible » ou « épuisé », jamais la quantité en stock ni les plafonds de remise — et à l'envoi de paniers. Nombre de bornes libre ; aucune par défaut.
- **RG-BOR-02 Panier.** Le client trouve les articles comme le commercial (RG-DEV-06 : champ unique, scan, favoris = meilleures ventes du magasin), choisit l'unité par boutons et la quantité au pavé numérique ; il voit le tableau de RG-DEV-05 **sans colonne Remise** : aucune remise n'est possible à la borne.
- **RG-BOR-03 Identification.** Pour terminer, le client saisit son **nom** et son **téléphone** (RG-DEV-04). La borne n'affiche jamais les données d'un client déjà connu : c'est le commercial qui, à la reprise, voit la fiche correspondant au téléphone et la confirme ou la corrige.
- **RG-BOR-04 Envoi.** Le panier devient un **devis** (`D-AAAA-nnnnnn`, origine « borne », sans commercial) portant un **numéro de panier** du jour (« P12 ») ; la borne l'affiche en grand avec le nom du client et « Un commercial va vous appeler », puis revient à l'accueil après 30 s. Les commerciaux voient en temps réel la liste des **paniers en attente** (numéro, nom, nombre de lignes, montant, attente).
- **RG-BOR-05 Reprise.** Un commercial **prend** un panier (verrou à son nom, comme RG-USR-08 ; le responsable peut le réaffecter), appelle le client par son nom et son numéro de panier, vérifie avec lui, peut modifier les lignes et appliquer les remises (RG-REM-*) ; puis le parcours normal reprend : validation (RG-CMD-02), ticket, caisse. Le devis porte ce commercial à partir de la reprise.
- **RG-BOR-06 Hygiène.** Sans interaction pendant **2 min**, la borne vide le panier en cours et revient à l'accueil (confidentialité). Un panier non repris expire à la fin de la journée (`day_end_time`). Une borne envoie au plus **20 paniers par heure** (paramètre) contre les abus.

## 6. Règles de gestion transverses

### 6.1 Articles et stock

- **RG-ART-01** Un article est identifié par un **code** unique (insensible à la casse, espaces de bord ignorés). Le code-barres est optionnel mais unique s'il est renseigné. *(Décision H7.)*
- **RG-ART-02** Un article n'est jamais supprimé : il est **désactivé** (invisible à la vente, historique conservé).
- **RG-ART-03 Prix par unité de vente.** Le prix de vente n'est pas porté par l'article mais par chacune de ses **unités de vente** (RG-ART-06). Il est modifiable par import ou par le responsable, toujours par création d'un nouveau prix daté (RG-ART-07), journalisé. Les commandes déjà validées ne sont pas affectées (RG-CMD-04). Un article dont **aucune** unité de vente active n'a de prix en vigueur est importable mais **non vendable** tant que le responsable n'a pas saisi un prix *(décision H14, 26/09/2026)*.
- **RG-ART-04** Toutes les quantités sont **décimales** (2 décimales, RG-FMT-01 ; les décimales nulles ne s'affichent pas : `12` et non `12,00`). L'**unité de base** (unité de comptage : pièce, kg, m, litre, sac, carton…) est obligatoire ; c'est l'unité dans laquelle le stock est compté. Sur devis, factures et exports, chaque ligne affiche l'unité de vente et, si elle diffère de l'unité de base, l'équivalence (« 5 cartons (× 12 pièces) »). *(Décision H7.)*
- **RG-ART-05** Chaque article porte la **date de sa dernière entrée** (import) ; chaque mouvement d'entrée porte la date d'import (horodatage système) et la **date d'entrée** déclarée à l'import (défaut : jour de l'import). *(Décision H7.)*
- **RG-ART-06 Unités de vente et grille de prix.** *(Décision H18.)* Un article possède **une ou plusieurs unités de vente**, chacune avec un libellé unique pour l'article, un **facteur** = nombre d'unités de base qu'elle représente (décimal, 3 décimales max, > 0), un prix en vigueur et, facultativement, un plafond de remise propre (RG-REM-01). L'unité de base est créée automatiquement comme unité de vente de facteur **1** ; elle peut être désactivée si l'article ne se vend qu'en conditionnement. Exemple : article `SAV-001`, unité de base « pièce » ; unités de vente : pièce (× 1, 4 500 MGA), paquet (× 6, 25 000 MGA), carton (× 72, 280 000 MGA). Toute quantité vendue est **convertie en unité de base** (`quantité × facteur`) pour le disponible, la réservation et la sortie de stock : il n'existe qu'**un seul stock** par article. Une unité de vente ne se supprime pas : elle se **désactive** (les commandes passées la référencent). Le facteur d'une unité utilisée par au moins une commande n'est plus modifiable : on crée une nouvelle unité.
- **RG-ART-07 Historique des prix.** *(Décision H18.)* Un prix n'est jamais **écrasé** : toute modification crée un nouveau prix avec une **date d'effet** (défaut : immédiate) et clôt le précédent à cette date ; l'ancien reste consultable. Il n'y a jamais deux prix en vigueur en même temps pour une même unité de vente. Chaque prix porte son origine (import n°… ou saisie manuelle), son auteur et sa date de saisie. La **fiche article** montre, par unité de vente, le prix en vigueur et l'**historique complet** (tableau : date d'effet, prix, variation en % et en MGA, origine, auteur ; courbe d'évolution sur la période choisie). Un prix à **date d'effet future** (ex. « nouveaux prix lundi ») est saisissable et devient automatiquement le prix en vigueur à sa date **[V1.1]**. Chaque ligne de commande référence le prix qui était en vigueur à sa validation (RG-CMD-04) : on peut toujours retrouver à quel prix un article a été vendu et pourquoi. L'historique s'exporte (RG-EXP-01).
- **RG-STK-01** Toutes les quantités de stock sont en **unité de base**. `théorique = Σ entrées − Σ sorties` ; `réservé = Σ quantités (× facteur) des commandes validées non livrées` (états `SUBMITTED`, `AT_REGISTER`, `PAID`, `PREPARING`, `READY`, `ISSUE`) ; `disponible = théorique − réservé`. Le stock affiché au commercial est toujours le **disponible**, dans l'unité de base et converti dans l'unité de vente sélectionnée (« 150 pièces = 2 cartons + 6 pièces »).
- **RG-STK-02** La validation d'une commande crée une réservation par ligne, **sans limite de durée dans la journée** : elle expire à la **fin de la journée** (paramètre `day_end_time`, défaut 23:59 heure d'Antananarivo, décision H16). À l'échéance : RG-CMD-08. *(Décision H3.)*
- **RG-STK-03** Le paiement rend la réservation **ferme** (sans échéance) jusqu'à la livraison.
- **RG-STK-04** La sortie de stock est enregistrée **à la livraison**, pas au paiement. Conséquence : « payé non livré » = stock encore en réserve mais non disponible à la vente. *(Décision H6.)*
- **RG-STK-05** Ajustement manuel : responsable uniquement, motif obligatoire parmi une liste paramétrable (casse, vol, erreur d'import, inventaire…) + commentaire libre ; journalisé. Jamais de modification directe d'une quantité.
- **RG-STK-06** Le stock théorique ne peut pas devenir négatif. Une sortie qui le rendrait négatif est refusée avec message.
- **RG-STK-07** Alerte (responsable, boss) quand `disponible ≤ seuil d'alerte` de l'article.

### 6.2 Remises

Principe *(décisions H4, H5, H13)* : les remises sont **paramétrées d'avance** sous forme de plafonds ; dans le plafond, le commercial les applique librement, sans validation par la caisse ni le responsable ; au-delà, seul le **boss** peut accorder une remise, matérialisée par un **code à usage unique**.

- **RG-REM-01 Plafonds paramétrés.** Chaque article porte une `remise_max_pct` (0 = aucune remise possible). Si elle n'est pas renseignée, le plafond de sa **catégorie** s'applique ; sinon le paramètre global `default_max_discount_pct` (défaut **0**). Une **unité de vente** peut porter sa propre `remise_max_pct` qui **surcharge** celle de l'article pour cette unité seulement (ex. carton remisable à 5 %, pièce non remisable) *(décision H18)* ; ordre de résolution : unité de vente → article → catégorie → paramètre. Les plafonds sont fixés par le **boss seul** (fiche article, unité de vente ou catégorie), dans l'application ; le responsable, le commercial et le caissier les voient sans les changer ; l'import ne les modifie pas. Toute modification est journalisée. *(Décision H15, 26/09/2026.)*
- **RG-REM-02 Application dans le plafond.** Le commercial voit le plafond de chaque article — et, pour la remise sur le total, le montant maximum possible (RG-REM-06) — **avant** de proposer quoi que ce soit ; l'interface refuse toute saisie au-delà. Une remise ≤ plafond est appliquée immédiatement, sans validation ni motif.
- **RG-REM-03 Demande de remise exceptionnelle.** Pour dépasser le plafond, le commercial (ou le caissier, ou le responsable) crée une **demande** : commande, client, **lignes concernées** et/ou **le total**, avec pour chacun le % ou le montant demandé *(décision H22, 25/09/2026)*, motif obligatoire. Le **boss** reçoit une **notification immédiate** (application, y compris à distance) avec le détail du client et de la commande. Il **accorde** ligne par ligne, et pour le total — la valeur demandée ou une autre —, ou **refuse** ; personne d'autre ne peut trancher. La décision est journalisée et visible sur la commande.
- **RG-REM-04 Code de remise.** Toute remise accordée par le boss est matérialisée par un **code unique** (8 caractères lisibles, ex. `R7K4-29QP`) : **lignes ou articles couverts** et/ou **le total**, avec le % ou le montant accordé pour chacun *(décision H22)*, commande visée (ou client visé si émis avant la commande), émis par le boss, date, **valable jusqu'à la fin de la journée** (paramètre), **usage unique**, révocable par le boss tant qu'il n'est pas utilisé. Le boss peut aussi émettre un code **sans demande préalable** (client spécial qui l'a contacté directement) en indiquant le client et, pour chaque article (ou pour le total), le % ou le montant. Le code est saisi par le commercial (avant validation) ou par le caissier (avant paiement) ; s'il a été émis en réponse à une demande sur cette commande, l'application le rattache **automatiquement** dès l'accord *(décision H17)*. Un code rattaché applique la remise aux lignes couvertes de la commande (et au total s'il le couvre), puis à la facture et au paiement, et passe UTILISÉ. Émission, usage, expiration et révocation sont journalisés.
- **RG-REM-05 Blocage.** Sans code valide, une remise hors plafond ne peut pas être appliquée : le paiement est bloqué tant que la commande porte une demande en attente. Le caissier peut, avec l'accord du client, **retirer** la remise demandée et encaisser au plafond, ou laisser la commande en file en attendant la réponse du boss (elle n'expire qu'en fin de journée).
- **RG-REM-06 Calcul.** *(Décisions de l'utilisateur, 23/09 et 25/09/2026.)* Une remise se saisit **en % ou directement en montant** (MGA), à deux niveaux cumulables :
  - **sur une ligne** (produit par produit) : le contrôle porte sur l'équivalent en % du **montant brut de la ligne** (quantité × prix unitaire), comparé au plafond de cette ligne (RG-REM-01) ou à la remise accordée par un code du boss la couvrant (RG-REM-04). Une ligne à plafond 0 n'est remisable que par un tel code ;
  - **sur le total** (facultative, une seule par devis) : elle s'applique au **sous-total** (somme des montants nets des lignes). Sans code, elle ne peut dépasser la **marge de remise restante** du devis = somme, sur les lignes, de (plafond de la ligne × brut de la ligne − remise de la ligne) : aucun produit ne dépasse ainsi son plafond, remise de ligne et part de la remise sur le total comprises ; l'écran affiche ce maximum en MGA. Au-delà, il faut un code du boss couvrant le total *(décision H23)*.

  La remise sur le total est **répartie** sur les lignes — pour la TVA, les statistiques par article et les avoirs partiels — au prorata de la marge restante de chaque ligne (au prorata des montants nets si elle vient d'un code du boss), chaque part arrondie au centime par la méthode du **plus fort reste** — chaque part au centime inférieur, puis les centimes manquants, un par un, aux parts dont le reste est le plus grand *(précision du 25/09/2026, T-031 : porter tout l'écart sur la plus grande part pouvait la rendre négative ou lui faire dépasser le plafond de sa ligne)* : la somme des parts égale exactement la remise sur le total, aucune part n'est négative ni ne dépasse la marge de sa ligne ; cette répartition n'est pas imprimée, elle est visible dans le détail de la commande (décision H23). **Total des remises** = remises des lignes + remise sur le total.
- **RG-REM-07 Traçabilité.** Les remises apparaissent sur la facture ligne par ligne (colonne Remise, RG-DEV-05), la remise sur le total sous le tableau, et leur somme en total des remises, avec la mention du code de remise le cas échéant. Le boss voit dans son tableau de bord les remises du jour (dans plafond / par code), les demandes en attente et les codes émis.

### 6.3 Ticket d'appel

- **RG-TKT-01** Ticket = **lettre** + **numéro**. Lettre = celle du commercial qui valide (permet à la caisse de savoir qui a vendu). Numéro = séquence quotidienne **par lettre**, démarrant à 1 chaque jour à 00:00 (heure d'Antananarivo). *(Décision H2.)*
- **RG-TKT-02** Un ticket est unique dans la journée et suit la commande jusqu'à la livraison.
- **RG-TKT-03** L'affichage du ticket est grand et lisible à 5 m sur l'écran public ; sur les postes, le ticket est toujours accompagné du **nom du client** pour permettre l'appel verbal.

### 6.4 Paiements

- *(Modalités de RG-PAY et de l'ouverture de caisse : décision H32, 28/09/2026.)*
- **RG-PAY-01** Les moyens de paiement forment une liste paramétrable (libellé, actif, référence obligatoire, ordre). Valeurs initiales : **Espèces, MVola, Orange Money, Airtel Money, Carte bancaire, Virement, Chèque**.
- **RG-PAY-02** Paiement **mixte** : plusieurs lignes de paiement ; la somme doit être exactement égale au total dû (après rendu monnaie sur la partie espèces).
- **RG-PAY-03** Espèces : montant reçu saisi ; rendu = reçu − dû sur la partie espèces ; enregistré et imprimé sur la facture.
- **RG-PAY-04** Référence de transaction obligatoire pour mobile money, virement, chèque et carte (paramétrable par moyen).
- **RG-PAY-05** Paiement partiel / acompte : **désactivé par défaut** (paramètre `allow_partial_payment`) **[V1.1]**. Si activé : reçu d'acompte numéroté, état `PARTIALLY_PAID`, facture émise et livraison possible uniquement au solde.
- **RG-PAY-06** Un paiement enregistré ne se modifie pas. Une erreur se corrige par annulation après paiement (RG-ANN-02) puis nouvelle commande.
- **RG-PAY-07** Tout paiement est rattaché à une session de caisse ouverte (RG-CAI-02).

### 6.5 Factures, avoirs, TVA

- *(Modalités de RG-FAC-01 à 04 : décision H33, 28/09/2026.)*
- **RG-FAC-01** Numéro de facture **séquentiel par année, sans trou** : `F-AAAA-nnnnnn` (préfixe paramétrable). Attribué au moment exact du paiement complet, dans la même opération indivisible. Jamais réutilisé, jamais modifié.
- **RG-FAC-02** Contenu figé : mentions légales du magasin, numéro, date/heure, ticket, commercial, caissier, **client (nom, téléphone)**, lignes en tableau selon RG-DEV-05 (N°, désignation avec le code, quantité, unité de vente — et équivalence en unité de base si différente —, prix unitaire, remise en % et montant, montant net), totaux selon RG-DEV-05 (total brut, remises sur les lignes, sous-total, remise sur le total éventuelle, total des remises avec le code de remise éventuel), [HT / TVA / TTC si TVA active], net à payer, lignes de paiement (moyen, référence, montant), reçu et rendu, pied de page paramétrable.
- **RG-FAC-03** TVA : paramètres `vat_enabled` (défaut **non**), `vat_rate` (défaut 20 %), `prices_include_vat` (défaut oui). Si désactivée : aucune ligne TVA, mention paramétrable (ex. « TVA non applicable »).
- **RG-FAC-04** Le PDF est généré et **stocké** à l'émission ; toute réimpression restitue le même fichier (jamais régénéré avec les paramètres du moment).
- **RG-FAC-05** Avoir : `AV-AAAA-nnnnnn`, séquentiel sans trou, référence la facture d'origine, motif, remboursement (moyen, référence, montant).
- **RG-FAC-06** Devis PDF : mention « Devis — valable jusqu'au JJ/MM/AAAA — ne vaut pas facture ». Le devis porte la date de sa **création** et reste valable `quote_validity_days` jours après, comptés à l'heure du magasin ; son PDF est refait à chaque ouverture depuis le devis enregistré. *(Décision H27, 26/09/2026.)*
- **RG-FAC-07** Mentions légales paramétrables : raison sociale, adresse, téléphone, **NIF, STAT, RCS**, logo, texte de pied de page. *(Décision H9.)*

### 6.6 Sessions et clôtures de caisse

- **RG-CAI-01** Une session s'ouvre par caissier sur une caisse donnée avec un **fond de caisse** saisi. Tous les paiements enregistrés pendant la session y sont rattachés.
- **RG-CAI-02** Une seule session ouverte par caissier à la fois ; impossible d'encaisser sans session ouverte.
- **RG-CAI-03** Clôture : l'application calcule le **théorique par moyen de paiement** ; le caissier saisit le comptage espèces ; l'écart est calculé, un commentaire est obligatoire si écart ≠ 0. Rapport de clôture PDF/Excel.
- **RG-CAI-04** Validation de la clôture par le responsable **[V1.1]** ; en MVP la clôture est consultable par le responsable et le boss dès qu'elle est faite.
- **RG-CAI-05** Une session oubliée ouverte est signalée au responsable le lendemain matin.

### 6.7 Formats

- **RG-FMT-01** Montants : `1 250 000,00 MGA` — espace insécable pour les milliers, virgule décimale, **2 décimales**, sigle ISO 4217 **« MGA »** après le nombre, séparé par une espace insécable. En toutes lettres, la devise s'écrit **« Ariary »** ; l'abréviation « Ar », non officielle, n'est jamais utilisée *(décision de l'utilisateur, 23/09/2026)*. **Dans un tableau**, les colonnes de montants n'affichent que le nombre, `1 250 000,00` : le sigle figure une seule fois, dans l'en-tête de la colonne, « Prix unitaire (MGA) », pour gagner de la place ; les totaux sous le tableau, les cartes et les phrases gardent « MGA » après chaque montant *(demande de l'utilisateur, 26/09/2026)*. Calculs et stockage avec 2 décimales, arrondi au plus proche (demi-supérieur). Quantités : même séparateur de milliers, jusqu'à 2 décimales, décimales nulles masquées.
- **RG-FMT-02** Dans les exports Excel, les montants et quantités sont des **nombres** (pas du texte) avec le format d'affichage appliqué.
- **RG-FMT-03** Dates : `JJ/MM/AAAA`, heures `HH:MM`, fuseau **Indian/Antananarivo (UTC+3)**.
- **RG-FMT-04** Paramètre optionnel `cash_rounding` (défaut : aucun) pour arrondir le net à payer en espèces (ex. à 100 MGA) ; l'arrondi apparaît comme une ligne distincte sur la facture.

### 6.8 Journal d'audit

- **RG-AUD-01** Journal **immuable** (ajout seul) : horodatage, utilisateur, rôle actif, poste, action, objet concerné, état avant, état après, motif. Consultable par admin, responsable et boss ; exportable.
- **RG-AUD-02** Événements journalisés au minimum : connexion/déconnexion et échecs ; création, validation, modification, annulation, expiration, réactivation de commande ; toute remise, toute demande de remise exceptionnelle, toute décision du boss, tout code émis / utilisé / révoqué ; paiement, facture, avoir ; appel, absence, réordonnancement de file ; import (prévisualisation, validation, annulation), ajustement, livraison, anomalie, retour ; ouverture et clôture de caisse ; modification de paramètre, de plafond de remise, de compte, de poste ; création, désactivation d'unité de vente ; **tout nouveau prix** (ancien → nouveau, origine) ; correction assistée.
- **RG-AUD-03** Les corrections de l'admin passent par des écrans dédiés qui produisent des opérations compensatoires (ajustement, avoir, réaffectation) — jamais d'écriture directe.

### 6.9 Nom de l'application

- **RG-APP-01** Le nom de l'application (onglet du navigateur, nom sous l'icône de la tablette, cadre de chaque écran, application d'authentification du boss et de l'admin) est **fixé avant la distribution**, par une commande de construction qui le vérifie ; par défaut « Vente Web ». Il ne se confond pas avec la raison sociale des factures (`store.legal`, RG-FAC-07). *(Demande de l'utilisateur, 26/09/2026 ; ADR-0006 ; modalités : décision H25, 26/09/2026.)*

## 7. Files d'attente et écran public

- **RG-DSP-01** S'il est déclaré (paramètre `display.enabled`, un seul écran), l'écran public affiche en temps réel, par file, les **5 derniers tickets appelés** avec le poste (« A15 → Caisse 2 », « C22 → Comptoir 1 »), le dernier appel en surbrillance, en très gros caractères. *(Décision H11.)*
- **RG-DSP-02** Signal sonore optionnel à chaque nouvel appel (paramètre).
- **RG-DSP-03** L'écran public se connecte avec une **clé de poste** (URL dédiée), sans compte utilisateur, en lecture seule ; il se reconnecte seul après coupure.
- **RG-DSP-04** Le responsable dispose d'une **vue de supervision en direct** : les deux files avec rang, ticket, client, commercial, montant, temps d'attente, état des remises (demande en attente) ; glisser-déposer pour réordonner ; indicateurs de la journée (attente moyenne, commandes en cours, payé non livré).
- **RG-DSP-05 Appel verbal.** Sans écran public, l'appel se fait de vive voix : le poste appelant affiche en grand le **ticket et le nom du client** à annoncer, et la tablette du commercial concerné reçoit une notification (il peut prévenir le client). Le fonctionnement des files est identique avec ou sans écran. *(Décision H11.)*

## 8. Import Excel des articles

- **RG-IMP-01** Modèle de fichier figé (annexe A), téléchargeable depuis l'application, première ligne = en-têtes. **Une ligne par couple article × unité de vente** *(décision H18)* : un article vendu en pièce, paquet et carton occupe trois lignes portant le même `code`. Colonnes **obligatoires** : `code`, `categorie`, `designation`, `unite`, `quantite` ; `facteur` vide ou `1` désigne l'**unité de base**, qui doit exister exactement une fois par article (dans le fichier ou déjà connue). Formats acceptés : `.xlsx` et `.csv` UTF-8. *(Décisions H7, H8.)*
- **RG-IMP-02** Deux modes : **ENTRÉE** (défaut) — la quantité de chaque ligne, **exprimée dans l'unité de la ligne** et convertie en unité de base, **s'ajoute** au stock (« 5 cartons » + « 20 pièces » = 380 pièces si carton × 72) ; **INVENTAIRE** — la somme des quantités converties **remplace** le stock théorique (responsable, double confirmation, chaque écart devient un ajustement motivé « inventaire »). Une ligne à `quantite` = 0 ne sert qu'à créer ou mettre à jour l'unité de vente et son prix.
- **RG-IMP-03** Code connu → mise à jour des attributs renseignés (colonnes vides = inchangé) + mouvement de stock ; code inconnu → création. Unité connue pour ce code → mise à jour (prix, actif ; jamais le plafond, fixé par le boss, décision H15) ; unité inconnue → création de l'unité de vente. Un `prix_vente` différent du prix en vigueur crée un **nouveau prix daté** (RG-ART-07) avec pour origine le numéro de l'import ; un prix identique ne crée rien. Sur les lignes d'un même article, `categorie` et `designation` sont lues sur la première ligne et peuvent être vides ensuite ; des valeurs **différentes** entre lignes sont une erreur bloquante. Un `facteur` différent de celui d'une unité déjà utilisée par une commande est une erreur bloquante (RG-ART-06).
- **RG-IMP-04 Déroulement en quatre temps** *(décision H8)* :
  1. **Dépôt** du fichier ; choix du mode et de la **date d'entrée** (défaut : aujourd'hui).
  2. **Visualisation** des données telles qu'elles seront enregistrées : tableau complet ligne par ligne (création / mise à jour d'article ou d'unité de vente, quantité convertie en unité de base et stock avant → après, prix avant → après avec variation en %), totaux (créations, mises à jour, quantités entrantes, **prix modifiés**), erreurs bloquantes ligne par ligne (code manquant, doublon code × unité dans le fichier, quantité, facteur ou prix non numérique, quantité négative, facteur nul, unité manquante, article sans unité de base, désignation ou catégorie divergente entre lignes d'un même code…) et avertissements (aucun prix → article non vendable, catégorie nouvelle, **variation de prix supérieure à ±30 %**…).
  3. **Annulation** possible à tout moment avant validation : rien n'est enregistré, l'import est tracé « annulé ».
  4. **Validation** par le responsable : enregistrement en une seule opération indivisible, horodatée (date d'import) ; mouvements de stock créés avec la date d'entrée.
- **RG-IMP-05** Import **tout ou rien** : une erreur bloquante empêche la validation. Option « importer uniquement les lignes valides » avec rapport des lignes ignorées.
- **RG-IMP-06** Chaque import est historisé : fichier conservé, auteur, date d'import, date d'entrée, mode, statut, résumé, mouvements générés. Un import **validé** ne s'annule pas ; on le corrige par un import inverse ou des ajustements.
- **RG-IMP-07** Import réservé au **responsable** (et à l'admin).
- **RG-IMP-08** La date d'import et la date d'entrée sont visibles sur la fiche article (dernière entrée) et sur chaque mouvement ; l'export des mouvements est filtrable par import.

## 9. Exports Excel

- **RG-EXP-01** Exports disponibles (filtres par période, article, acteur selon le cas) : mouvements de stock (en unité de base, avec l'unité et la quantité saisies) ; état du stock (théorique, réservé, disponible en unité de base, valeur au prix en vigueur de l'unité de base, date de dernière entrée) ; **grille de prix** (article × unité de vente, facteur, prix en vigueur, plafond) ; **historique des prix** (article, unité, date d'effet, prix, variation, origine, auteur) ; ventes (factures et lignes, avec unité de vente et quantité en unité de base) ; encaissements par moyen de paiement ; remises accordées (dans plafond / par code) ; codes de remise émis ; clôtures de caisse ; journal d'audit ; files d'attente et temps d'attente ; clients.
- **RG-EXP-02** Colonnes définies et stables (les agents ne les renomment pas sans mettre à jour ce document) ; en-têtes en français ; nombres natifs (RG-FMT-02).
- **RG-EXP-03** Accès : boss et responsable (tous), caissier (ses clôtures), admin (journal).

## 10. Documents PDF

| Document | Quand | Format | Priorité |
|---|---|---|---|
| Facture | Au paiement | A4 ; ticket 80 mm en option | [MVP] / [V1.1] |
| Devis | À la demande | A4 | [MVP] |
| Avoir | À l'annulation après paiement | A4 | [MVP] |
| Rapport de clôture | À la clôture | A4 | [MVP] |
| Bon de livraison | À la livraison | A4 | [V1.1] |
| Reçu d'acompte | Si paiement partiel activé | A4 / 80 mm | [V1.1] |

- **RG-PDF-01** Impression depuis le navigateur (dialogue d'impression) en MVP ; impression directe sur imprimante thermique via le serveur **[V1.1]**. *(Décision H10.)*

## 11. Tableau de bord du boss

Accessible à distance sur téléphone et PC, actualisé en temps réel. *(Décision H13 : le boss consulte ; sa seule action est d'accorder les remises exceptionnelles.)*

- **RG-DSH-01** Indicateurs par **heure, jour, semaine, mois** et période libre : **total encaissé** et détail **par moyen de paiement** ; nombre de factures ; **quantités vendues** (par article en unité de base, détail par unité de vente, par catégorie) ; panier moyen ; remises accordées (montant, % du brut, dans plafond / par code) ; avoirs ; ventes par commercial ; ventes par heure de la journée.
- **RG-DSH-02** Files en direct : nombre en attente caisse / livraison, temps d'attente moyen et maximum du jour, payé non livré.
- **RG-DSH-03** Stock : articles sous le seuil d'alerte, top 20 des ventes avec disponible restant. Prix : **modifications de prix de la période** (article, unité, ancien → nouveau, %, origine, auteur) et courbe d'évolution d'un article choisi (RG-ART-07).
- **RG-DSH-04** Comparaisons : veille, même jour de la semaine précédente, semaine, mois.
- **RG-DSH-05** Notifications au boss : **[MVP]** demande de remise exceptionnelle (RG-REM-03), avec accord/refus en un geste et affichage du code émis ; **[V1.1]** résumé de fin de journée, clôture avec écart, stock sous seuil.
- **RG-DSH-06** Le responsable voit le même tableau de bord, limité au magasin, plus la supervision des files (RG-DSP-04) ; il ne voit pas les demandes de remise adressées au boss autrement qu'en lecture.
- **RG-DSH-07** Hors remises exceptionnelles (RG-REM-03/04), le boss ne modifie rien ; s'il veut agir comme responsable, l'admin lui attribue aussi ce rôle (RG-USR-02) et ses actions sont journalisées sous ce rôle.

## 12. Historique

- Fiche commande : chronologie complète (création, validation, appels, remises et codes, paiement, facture, livraison) avec acteur et heure.
- Fiche article : mouvements de stock (avec dates d'import et d'entrée) et ventes.
- Fiche client : commandes, factures, remises et codes obtenus.
- Fiche utilisateur : activité (commandes, paiements, décisions).
- Journal d'audit global filtrable (RG-AUD).

## 13. Paramètres (admin)

| Clé | Défaut | Description |
|---|---|---|
| `store.legal` | — | Raison sociale, adresse, téléphone, NIF, STAT, RCS, logo, pied de page |
| `currency` | MGA | Devise (fixe) |
| `vat_enabled` / `vat_rate` / `prices_include_vat` | non / 20 % / oui | TVA optionnelle |
| `vat_notice` | (vide) | Mention imprimée sur la facture quand la TVA est désactivée, ex. « TVA non applicable » (RG-FAC-03, décision H33) |
| `cash_rounding` | aucun | Arrondi espèces (RG-FMT-04) |
| `invoice_prefix` / `credit_note_prefix` / `quote_prefix` | F / AV / D | Préfixes de numérotation |
| `day_end_time` | 23:59 | Fin de journée : expiration des réservations (RG-STK-02) et des codes de remise (RG-REM-04) (décision H16) |
| `quote_validity_days` | 7 | Validité d'un devis |
| `default_max_discount_pct` | 0 | Plafond de remise si ni l'article ni sa catégorie n'en ont |
| `discount_code.length` | 8 | Longueur des codes de remise |
| `discount_reasons` / `adjustment_reasons` | listes | Motifs proposés (demande de remise exceptionnelle, ajustement) |
| `payment_methods` | 7 moyens | Liste, référence obligatoire, ordre |
| `allow_partial_payment` | non | Acomptes [V1.1] |
| `display.enabled` / `display.sound` / `display.last_calls` | non / oui / 5 | Écran public (0 ou 1) ; sans écran, appel verbal |
| `kiosk.idle_seconds` / `kiosk.max_baskets_per_hour` | 120 / 20 | Borne libre-service : remise à zéro après inactivité, limite d'envoi (RG-BOR-06) (décision H24) |
| `session.lock_minutes.tablet` / `.register` | 5 / 15 | Verrouillage inactivité |
| `stations` | — | Postes déclarés : tablettes, caisses, comptoirs, écran, bornes — nombre libre, modifiable à tout moment (RG-NFR, décision H11) |

## 14. Exigences non fonctionnelles (vue métier)

- **Simplicité** : un commercial doit créer une commande de 5 lignes en moins d'une minute après une heure de formation. Boutons larges, lisibles au soleil, utilisables au doigt.
- **Réactivité** : toute action courante répond en moins d'une seconde sur le réseau local ; un appel apparaît sur l'écran public ou le poste appelant en moins de deux secondes ; une demande de remise atteint le boss en moins de cinq secondes (Internet disponible).
- **Continuité** : le magasin fonctionne sans Internet (serveur local) ; seule la notification du boss à distance dépend d'Internet (en son absence, le boss peut être joint par téléphone et émettre le code à son retour en ligne, ou un code déjà émis reste utilisable). Sans Wi-Fi local, rien ne fonctionne : le Wi-Fi du magasin est une infrastructure critique (onduleur, point d'accès de secours).
- **Perte de données** : au plus 15 minutes en cas de sinistre (sauvegarde cloud), reprise en moins de 2 heures sur une machine de secours.
- **Postes** : **autant de tablettes, de caisses et de comptoirs que nécessaire**, déclarés par l'admin dans `stations` au démarrage et modifiables ensuite sans arrêt du service ; 0 ou 1 écran public. *(Décision H11.)* Dimensionnement cible du matériel : ≤ 30 utilisateurs simultanés, ≤ 2 000 commandes/jour, ≤ 50 000 articles, 10 ans d'historique consultables.
- **Langue** : français ; nombres et dates au format malgache/français (§6.7).
- **Appareils** : tablettes Android 10" (Chrome), PC Windows (Chrome/Edge), téléphone (Android/iOS) pour le boss, TV avec navigateur pour l'écran public éventuel.

## 15. Priorisation

| Lot | Contenu |
|---|---|
| **[MVP]** — première mise en service | Comptes et rôles, PIN, 2FA boss/admin · Postes paramétrables · Import articles en quatre temps (ENTRÉE et INVENTAIRE, une ligne par article × unité) · Catalogue, **unités de vente et grille de prix, historique des prix** (consultation sur la fiche article, export), disponibilité en unité de base, réservation jusqu'à fin de journée, expiration · Répertoire clients (nom + téléphone) · Devis (recherche et saisie rapides, scan en rafale), commande, ticket · Remises plafonnées (ligne et total, % ou montant) + demande au boss + codes de remise, notification du boss · Borne de commande en libre-service · Files caisse et livraison, écran public optionnel ou appel verbal, supervision et réordonnancement · Paiement multi-moyens, facture PDF A4, avoir total/partiel · Sessions et clôture de caisse simple · Livraison multi-comptoirs, sortie de stock, anomalies · Exports (mouvements, ventes, encaissements, stock, remises, codes, audit) · Tableau de bord boss (RG-DSH-01 à 04, horaire → mensuel) · Journal d'audit · Déploiement magasin (serveur local, tunnel, DNS, sauvegardes, onduleur) |
| **[V1.1]** | Prix à date d'effet future (RG-ART-07) · Retours après livraison · Bon de livraison · Ticket 80 mm et impression thermique directe · Mini-ticket d'appel imprimé · Paiement partiel / acompte · Validation des clôtures par le responsable · Autres notifications au boss (fin de journée, écarts, stock) · Fiche client enrichie (historique détaillé, notes) |
| **[V2]** | Réplique cloud en lecture seule (tableau de bord même magasin hors ligne) · Multi-magasins · Articles à variantes · Fidélité · Application APK/TWA si un besoin réel apparaît |

## 16. Hypothèses — décisions et points ouverts ⚠️

### 16.1 Hypothèses tranchées le 21/09/2026

| # | Hypothèse initiale | Décision de l'utilisateur | Règles impactées |
|---|---|---|---|
| H1 | Un seul magasin en V1 | Un seul magasin ; **plusieurs magasiniers** (et comptoirs) | §2.2, RG-USR-08, RG-LIV-02 |
| H2 | Lettre du ticket = commercial qui valide | **OK** | RG-USR-07, RG-TKT-01 |
| H3 | Réservation 30 min | **Pas de limite dans la journée** : expiration en fin de journée | RG-STK-02, RG-CMD-08, `day_end_time` |
| H4 | Plafond d'approbation caissier 10 % | **Plus d'approbation par le caissier.** Remises paramétrées d'avance ; au-delà, seul le boss, par un **code unique** | §6.2 entier, §5.6, annexe B |
| H5 | Politique par défaut = VALIDATION | Remplacée par des **plafonds** (défaut 0 %) | RG-REM-01 |
| H6 | Sortie de stock à la livraison | **OK** ; le disponible déduit toutes les commandes validées non livrées (file caisse comprise) | RG-CMD-02, RG-STK-01 |
| H7 | Quantités entières par défaut | **Décimales partout** ; article = code unique, catégorie, désignation, unité de comptage, quantité ; date d'importation | RG-ART-01/04/05, RG-IMP-01, annexe A |
| H8 | Import tout ou rien | **OK**, en quatre temps : dépôt → visualisation → annulation possible → validation | RG-IMP-04/05/06 |
| H9 | NIF, STAT, RCS | **OK** | RG-FAC-07 |
| H10 | Impression navigateur en MVP | **OK** | RG-PDF-01 |
| H11 | 3–5 tablettes, 1–2 caisses, 1 comptoir, 1 écran | **Nombre libre** de tablettes, caisses, comptoirs ; 1 écran ou appel verbal ; paramétrable au départ et modifiable | §14, §13 `stations`, RG-DSP-01/05 |
| H12 | Client anonyme par défaut | **Non** : nom + contact obligatoires | RG-DEV-04, RG-FAC-02 |
| H13 | Boss en lecture seule | Tableau de bord horaire/journalier/… ; **notification** des demandes de remise spéciale et **code** appliqué automatiquement à la facturation et au paiement | §11, RG-REM-03/04, RG-DSH-05/07 |
| H18 | Un prix par article | **Grille de prix par unité de vente** ; stock tenu dans une **unité de base** avec facteur de conversion par unité ; import une ligne par couple article × unité ; plafond de remise par article, surcharge possible par unité ; **historique des prix** avec date d'effet et suivi de l'évolution | RG-ART-03/04/06/07, RG-REM-01, RG-CMD-02/04, RG-STK-01, RG-IMP-01/02/03, RG-EXP-01, RG-DSH-03, annexe A |

Les ADR 0001 à 0004 ont été **acceptés** par l'utilisateur le 21/09/2026.

### 16.2 Points nouveaux à confirmer

H14 à H28 tranchés le 26/09 (§16.5), H29 le 27/09 (§16.6), H30 à H33 le 28/09 (§16.7). Un nouveau point s'inscrit ici, marqué ⚠️ HYPOTHÈSE dans la règle concernée.

| # | Hypothèse | Règle | Alternative |
|---|---|---|---|
| H34 | **Livraison** (T-060) : le magasinier prend en charge la première commande payée de la file (« Prendre la suivante ») ou un ticket précis si le client est devant lui (journalisé) ; il n'a qu'**une commande à la fois** (préparation puis remise) ; elle passe `PREPARING` à son nom, les autres la voient à lui (RG-USR-08). Préparée, il la déclare **prête** : le ticket est appelé (« A15 → Comptoir 1 » ; tant que les postes ne sont pas appairés, T-015, le nom du magasinier ; appel verbal sans écran public). À la remise, il **coche chaque ligne** ; toutes cochées, « Livrer » enregistre la sortie de stock (un mouvement par ligne, en unité de base), consomme la réservation et passe la commande `DELIVERED`. Une ligne non remise relève de l'anomalie (T-061). Client **absent** à l'appel : la commande revient en fin de file livraison, toujours payée, réservation ferme, absences comptées, le responsable prévenu à la 2ᵉ ; ce qui a été préparé reste au comptoir. Le **responsable** peut remettre en file une commande en préparation ou prête (réaffectation, RG-USR-08) : elle reprend sa place et un autre magasinier la prend. D'où deux sorties ajoutées au §5.2 : « En préparation → Payée » et « Prête → Payée » (retour en file) | RG-LIV-01 à 03, RG-USR-08, RG-FIL-06, RG-STK-04, §5.2 | Plusieurs commandes à la fois par magasinier ; réaffectation directe à un magasinier nommé |


### 16.3 Corrections de l'utilisateur du 23/09/2026

Faites à la lecture de la première maquette de l'écran de vente.

| # | Avant (v0.3 ou maquette) | Décision de l'utilisateur | Règles impactées |
|---|---|---|---|
| C1 | Remise par ligne **ou** remise globale répartie au prorata sur les lignes | La remise se fait **sur chaque produit**, jamais sur le total du devis — *complétée le 25/09 par C4 (§16.4)* | §5.3, §4, RG-REM-03/04/06/07, H22 |
| C2 | Symbole « Ar » après les montants | Sigle officiel **MGA** ; « **Ariary** » en toutes lettres ; « Ar » n'est pas officiel et n'est jamais utilisé | RG-FMT-01/04, RG-ART-06/07, §5.3 |
| C3 | Lignes du devis écrites en texte (« 2 × Riz, sac 50 kg ») | **Tableau** à colonnes, dans l'esprit « Rubrique / Nombre / Unité / … » demandé, rendu par les termes usuels : N°, Désignation, Quantité, Unité, Prix unitaire, Remise, Montant net | RG-DEV-05, RG-FAC-02 |

### 16.4 Décisions de l'utilisateur du 25/09/2026

Faites en réponse aux questions de la v0.4 et à la relecture de la maquette en tableau.

| # | Avant (v0.4) | Décision de l'utilisateur | Règles impactées |
|---|---|---|---|
| H22 | Remise exceptionnelle sur plusieurs lignes : un % par ligne ou un seul % ? | **Un % (ou un montant) par ligne**, le boss tranche ligne par ligne ; la demande et le code peuvent aussi porter sur le total (C4) | RG-REM-03/04, §4 |
| C3 bis | Libellés des colonnes du tableau | Termes usuels confirmés : **Désignation**, Quantité… | RG-DEV-05 |
| C4 | Remise uniquement par ligne, jamais sur le total | La remise peut être un **montant direct** (pas seulement un %) et porter **aussi sur le total** du devis, en plus des lignes | RG-REM-02/03/04/06/07, RG-DEV-05, RG-FAC-02, H23 |
| C5 | Recherche d'articles par texte, catégorie ou caméra (§5.3) | **Recherche et saisie rapides, sans défilement** ; solution laissée au choix de l'agent : champ unique code / code-barres / désignation, ajout direct sur code exact, scan en rafale, quantité en tête, pavé numérique, favoris | RG-DEV-06, §5.3 |
| C6 | — | **Écrans où le client passe lui-même sa commande** : borne libre-service dans le magasin, panier repris par un commercial | §5.10, RG-BOR-01 à 06, H24 |

### 16.5 Décisions de l'utilisateur du 26/09/2026

Toutes les hypothèses ouvertes ont été tranchées ; les règles citées ont été mises à jour en conséquence.

| # | Hypothèse | Décision de l'utilisateur | Règles impactées |
|---|---|---|---|
| H14 | Le **prix de vente** n'est pas dans les colonnes minimales du fichier : colonne `prix_vente` facultative ; un article dont aucune unité de vente n'a de prix est importé mais non vendable jusqu'à saisie d'un prix par le responsable | **OK** | RG-ART-03, annexe A |
| H15 | Les **plafonds de remise** sont paramétrés par le responsable (fiche article / catégorie / import) ; le boss les voit et peut les modifier | **Plafonds fixés par le boss seul** ; le responsable les voit sans les modifier ; la colonne `remise_max_pct` de l'import est supprimée | RG-REM-01, annexes A et B, RG-REM-01, annexe B |
| H16 | **Fin de journée** = 23:59 par défaut (paramètre `day_end_time`) | **OK** (23:59, paramètre `day_end_time`) | RG-STK-02, RG-REM-04 |
| H17 | Un code émis **en réponse à une demande** est rattaché automatiquement à la commande dès l'accord du boss (le code reste affiché comme preuve) ; la saisie manuelle sert aux codes émis sans demande ou communiqués par téléphone | **OK** | RG-REM-04 |
| H19 | **Valeurs d'authentification non fixées par le CDC** (T-012) : mot de passe ≥ 10 caractères ; session serveur de **12 h** maximum (variable `AUTH_SESSION_HOURS`, de 1 à 12) ; expiration d'inactivité côté serveur = délai de verrouillage du poste (tablette 5 min, caisse 15 min, RG-USR-03), **15 min** sur les autres postes et **60 min** à distance ; limitation à **10 tentatives/min** à distance et **60/min** dans le magasin, comptées **par route**, origine et adresse (chaque route qui reçoit un secret a son propre budget ; la protection par compte reste RG-USR-05) ; les 5 échecs de RG-USR-05 sont comptés tant qu'ils se suivent : le compteur repart à zéro après **15 min sans échec** (chaque échec prolonge la fenêtre) ou à l'expiration d'un verrou ; à la connexion hors du magasin, un compte verrouillé répond comme un mot de passe faux (ne pas révéler l'existence du compte) ; un utilisateur déjà connecté, qui connaît son compte, reçoit le verrouillage (423) partout ; le verrou est posé dès la 5ᵉ tentative, **avant** la vérification du secret (aucune requête concurrente ne glisse une 6ᵉ vérification), et un 5ᵉ secret juste le lève aussitôt en ouvrant la session ; un mauvais secret courant en libre-service (changement de PIN ou de mot de passe, ré-enrôlement ou confirmation TOTP) et le choix d'un rôle non détenu comptent comme des échecs ; un PIN ou un mot de passe courant juste remet le compteur à zéro comme une connexion ; un **code TOTP juste seul** (ré-enrôlement, confirmation), qui ne prouve ni le PIN ni le mot de passe, rend sa tentative comme si elle n'avait pas eu lieu : les échecs antérieurs restent comptés avec leur propre fenêtre, le verrou qu'il venait de poser comme 5ᵉ tentative est retiré, un verrou posé par une autre tentative reste ; l'enrôlement TOTP est refusé tant que le compte est verrouillé ; deux courses de quelques millisecondes sont acceptées : un code TOTP rendu pendant l'échec d'une requête concurrente peut verrouiller le compte un échec plus tôt (côté strict), et un code rendu juste après une remise à zéro suivie d'un nouvel échec peut effacer cet échec (il faut déjà une session par mot de passe et le code TOTP courant) ; les tentatives sur un nom inconnu ou refusées pendant un verrou (connexion comme libre-service) ne vont pas dans `audit_log` (journal applicatif seulement, nom haché avec une clé propre au processus : les répétitions restent repérables, un journal divulgué ne se compare pas à un dictionnaire) ; l'expiration d'inactivité tolère un intervalle de rafraîchissement (1 min) ; toute fin de session est journalisée avec sa raison, y compris les sessions expirées balayées à la connexion suivante | **OK** | RG-USR-03, RG-USR-05, CDC technique §8 |
| H20 | **Gestion des secrets** (T-012) : chaque utilisateur **enrôle lui-même** son code à usage unique (TOTP) depuis le magasin — démarrage **et** confirmation —, avec une session ouverte par mot de passe, et change lui-même son PIN ou son mot de passe (ancien secret exigé) ; l'admin **pose ou réinitialise** un mot de passe (tout compte, `owner` compris : l'admin est de confiance et chaque changement est journalisé ; question ouverte au journal du 22/09/2026, tranchée ci-contre) ou un PIN (comptes à rôle opérationnel), réinitialise un TOTP, lève un verrouillage avant les 15 min et déconnecte tous les postes d'un compte, **sans jamais voir un secret** ; tout changement de PIN ou de mot de passe ferme les autres sessions du compte ; un changement de TOTP (confirmation d'un enrôlement, réinitialisation par l'admin) ferme les sessions ouvertes à distance, les seules à l'avoir utilisé. L'obligation de changer un mot de passe posé par l'admin est reportée (T-016) | **OK**, sauf pour le mot de passe du boss : **l'admin ne le pose ni ne le réinitialise** ; il génère un code d'activation à usage unique (24 h) avec lequel le boss choisit lui-même son mot de passe (premier mot de passe, oubli) | RG-USR-10, RG-USR-03, RG-USR-04, RG-USR-05, annexe B |
| H21 | **Poste et sessions** (T-012) : le poste est **facultatif** à la connexion tant que l'appairage des postes (T-015) n'existe pas ; quand il est donné, il doit être actif et compatible avec le rôle (tablette → commercial, caisse → caissier, comptoir → magasinier ; responsable, admin et boss partout ; jamais l'écran public) ; un même utilisateur peut avoir **plusieurs sessions simultanées** (ex. responsable sur tablette et à la caisse) | **Une seule session par personne** : une nouvelle connexion ferme la précédente (journalisé) ; **poste obligatoire** dans le magasin, dès l'appairage des postes (T-015) ; à distance, sans poste | RG-USR-09, RG-USR-02, RG-USR-03, §13 `stations` |
| H23 | **Remise sur le total** (C4) : sans code, plafonnée par la **marge de remise restante** des lignes (somme des plafonds × bruts − remises des lignes) ; répartie sur les lignes au prorata de cette marge (au prorata des montants nets si elle vient d'un code du boss) ; au-delà, code du boss couvrant le total | **OK** | RG-REM-02/03/04/06, RG-DEV-05 |
| H24 | **Borne libre-service** (C6) : dans le lot MVP (dernière tâche de la vente) ; le panier devient un devis repris par un commercial, qui seul valide ; aucune remise à la borne ; stock affiché « disponible / épuisé » sans quantité ; remise à zéro après 2 min d'inactivité ; 20 paniers par heure et par borne au plus | **OK** | §5.10, RG-BOR-01 à 06, §13 |
| H25 | **Nom de l'application** : fixé à la construction, non modifiable par l'admin ; nom de 1 à 40 caractères ; nom court sous l'icône de 12 caractères au plus ; le logo (T-010c) et les couleurs ne changent pas avec le nom | **OK** | RG-APP-01, ADR-0006 |
| H26 | **Téléphone et fusion des clients** (T-029) : numéro malgache de 10 chiffres commençant par 0 (`+261`, `00261` et `261` convertis), ou numéro étranger en `+indicatif` suivi de 8 à 15 chiffres ; enregistré sans espaces, affiché `034 12 345 67` ; un seul client actif par numéro. La fusion désactive la fiche en double, qui pointe vers la fiche conservée ; ses devis, commandes et factures restent sur elle (facture figée, RG-FAC-02) et la fiche du client les regroupe | **OK**, avec **deux téléphones au plus** par client ; un numéro n'appartient qu'à un seul client actif | RG-DEV-04 |
| H27 | **Date et validité du devis imprimé** (T-030) : le devis porte la date de son dernier enregistrement, jour où ses prix ont été fixés ; il est valable le nombre de jours du paramètre `quote_validity_days` après (défaut 7, RG-DEV-02), jours comptés à l'heure du magasin. Le PDF est refait à chaque ouverture depuis le devis enregistré, jamais conservé (seule la facture est figée, RG-FAC-04) ; il ne s'ouvre que sur un devis enregistré et non modifié depuis. La TVA n'y figure pas tant qu'elle est désactivée (RG-FAC-03) | **Date du devis = date de sa création** ; validité comptée depuis cette date ; PDF toujours refait depuis le devis enregistré | RG-DEV-02, RG-FAC-06 |
| H28 | **Validation de la commande** (T-032) : la commande garde le **numéro de son devis** (`D-AAAA-nnnnnn`, même objet, §4) ; dans la journée, le ticket l'identifie. Elle porte sur le devis **tel qu'enregistré** : si un prix a changé depuis l'enregistrement, la validation est refusée et la tablette réenregistre le devis au nouveau prix, que le commercial vérifie avec le client avant de valider à nouveau ; les plafonds sont relus au moment de la validation. Un commercial qui valide le devis d'un collègue le reprend tel quel : la commande porte son nom et sa lettre (RG-DEV-03), le créateur du devis reste dans le journal d'audit ; le **responsable** qui valide laisse la commande au commercial du devis, dont la lettre fait le ticket. Un commercial sans lettre de ticket ne peut pas valider. Une réservation par **article** (ses lignes cumulées, RG-CMD-02), jusqu'à la prochaine `day_end_time` : celle du jour, ou celle du lendemain si l'heure est déjà passée | **OK** | RG-CMD-01/02/03/04, RG-DEV-03, RG-STK-02, RG-TKT-01 |

### 16.6 Décisions de l'utilisateur du 27/09/2026

| # | Hypothèse | Décision de l'utilisateur | Règles impactées |
|---|---|---|---|
| H29 | **Files d'attente** (T-040) : un caissier (ou le responsable) n'a qu'**un client à sa caisse** : il l'encaisse ou le déclare absent avant d'en appeler un autre ; « Appeler le suivant » prend le premier de la file, et deux caisses qui appellent au même instant n'ont jamais le même ticket ; seul le caissier qui a appelé le client, ou le responsable, le déclare absent ; un ticket marqué **prioritaire** passe derrière les autres prioritaires et devant tous les autres, et le retrait de la priorité le laisse à sa place ; l'attente affichée court depuis la validation, y compris après une absence (statistiques RG-FIL-05 : attente = validation → dernier appel, traitement = dernier appel → paiement) ; tant que les postes ne sont pas appairés (T-015), l'appel indique le caissier au lieu du nom de la caisse ; le commercial n'est prévenu de l'appel de son ticket qu'en mode appel verbal (sans écran public, RG-DSP-05) | **OK** | RG-FIL-02/03/04/05, RG-DSP-05 |

### 16.7 Décisions de l'utilisateur du 28/09/2026

H30 à H33 en réponse aux questions posées ; C7 à la relecture du code de T-018 à T-050.

| # | Hypothèse ou constat | Décision de l'utilisateur | Règles impactées |
|---|---|---|---|
| H30 | **Contrôle à la caisse** (T-050) : les modifications se font sur la commande appelée à la caisse (client présent), par le caissier qui l'a appelée ou le responsable ; jamais d'ajout ni de hausse, et la dernière ligne ne se supprime pas (c'est une annulation). Une **quantité baissée** garde le taux de remise de sa ligne (la remise suit la quantité) ; une ligne inchangée garde sa remise au centime ; la **remise sur le total** saisie en % garde son %, saisie en montant elle garde son montant, **ramenée au maximum permis** (marge restante, RG-REM-06) si les lignes restantes ne la couvrent plus. Une ligne supprimée sort de la commande, les numéros se suivent à nouveau ; le journal garde l'avant/après. **Annulation** : motif en texte libre, obligatoire (3 caractères au moins) ; le commercial annule ses propres commandes, en file comme à la caisse | **OK** | RG-CMD-05b, RG-ANN-01, RG-REM-06 |
| H31 | **Expiration et réactivation** (T-022, T-035) : le serveur vérifie toutes les 30 s, et à son démarrage, les commandes échues ; seule une commande **en file** (`SUBMITTED`) expire. Un client **à la caisse** à la fin de la journée reste au caissier (il l'encaisse ou l'annule) ; déclaré absent ensuite, sa commande expire aussitôt. Le commercial en est averti sur sa tablette s'il est connecté ; sinon il la retrouve dans sa liste (T-035). **Réactivation** (T-035) : par le commercial pour ses commandes, ou par le responsable (la commande reste au commercial) ; mêmes contrôles qu'une validation (stock, prix, plafonds, H28) : si un prix a changé depuis, la réactivation est refusée et la commande redevient un **devis** au nouveau prix, même numéro, à revoir avec le client avant de valider de nouveau | **OK** | RG-CMD-08, RG-STK-02, RG-CMD-06 |
| H32 | **Encaissement** (T-051) : la **session de caisse** s'ouvre dès T-051 (RG-CAI-01/02, RG-PAY-07) : le caissier choisit sa caisse parmi les caisses actives et saisit le fond de caisse ; une caisse n'a qu'une session ouverte, un caissier aussi ; le responsable qui encaisse ouvre lui aussi la sienne ; la clôture vient avec T-054. Un appel fait depuis une caisse ouverte affiche son nom (« A15 → Caisse 2 »). Le **paiement** porte sur la commande appelée à la caisse, par le caissier qui l'a appelée ou le responsable : une ou plusieurs lignes (moyen, montant, référence) dont la somme est **exactement** le net à payer ; une seule ligne en espèces, montant reçu au moins égal à sa part, rendu = reçu − part ; référence obligatoire selon le moyen (carte bancaire comprise, RG-PAY-04), 80 caractères au plus. Au paiement : commande payée, réservation ferme, entrée en file livraison, journal avant → après ; une répétition réseau du même paiement rend le même résultat. La **facture numérotée** vient avec T-052 ; l'arrondi espèces (RG-FMT-04) avec elle ; le blocage tant qu'une demande au boss est en attente avec T-033 | **OK** | RG-PAY-01 à 07, RG-CAI-01/02, RG-STK-03, RG-LIV-01 |
| H33 | **Facture** (T-052) : numéro `<préfixe>-AAAA-nnnnnn` (paramètre `invoice_prefix`, défaut `F`), l'année étant celle du magasin au moment du paiement, compteur par année pris dans la transaction même du paiement : un paiement refusé ou interrompu ne consomme aucun numéro. Le **contenu est figé** à l'émission (RG-FAC-02) et le PDF écrit dans `files/invoices/<année>/<numéro>.pdf` aussitôt après ; si l'écriture échoue, le fichier est produit à la première demande **depuis ce contenu figé**, jamais avec les paramètres du moment. La facture s'ouvre depuis la caisse juste après le paiement ; caissier et responsable peuvent la rouvrir. **TVA active** : le net à payer est ventilé en HT, TVA et TTC, les prix étant TTC (`prices_include_vat` = oui) ; des prix hors taxes ne sont pas encore pris en charge. **TVA inactive** : aucune ligne de TVA ; la mention du paramètre `vat_notice` (vide par défaut, ex. « TVA non applicable ») s'imprime si elle est remplie. L'**arrondi espèces** (RG-FMT-04, `cash_rounding`) reste à faire (T-056) ; le code de remise du boss s'y ajoutera avec T-034 | **OK** | RG-FAC-01 à 04, RG-FAC-07, RG-FMT-04 |
| C7 | Une commande prioritaire déclarée absente revenait en fin de file **en gardant sa priorité** : au marquage prioritaire suivant, elle repassait en tête avec les autres prioritaires, sans trace au journal | Un client **absent perd sa priorité** ; de même pour une commande prioritaire que le responsable **place en dernier**. Le journal garde la priorité avant → après | RG-FIL-02, RG-FIL-04 |

## Annexe A — Modèle Excel d'import des articles

**Une ligne par couple article × unité de vente** (RG-IMP-01). Les colonnes d'article (`categorie`, `designation`, `code_barres`, `seuil_alerte`, `actif`) se lisent sur la première ligne du code ; elles peuvent rester vides sur les suivantes.

| Colonne | Obligatoire | Type | Exemple | Remarque |
|---|---|---|---|---|
| `code` | **oui** | texte | `SAV-001` | Code unique de l'article (RG-ART-01) ; répété sur chaque ligne d'unité |
| `categorie` | **oui** (1re ligne du code) | texte | `Hygiène` | Créée si inconnue |
| `designation` | **oui** (1re ligne du code) | texte | `Savon de Marseille 300 g` | |
| `unite` | **oui** | texte | `pièce`, `paquet`, `carton` | Unité de vente de la ligne ; unique par article (RG-ART-06) |
| `facteur` | non | nombre (3 décimales) | vide, `1`, `6`, `72` | Nombre d'unités de base ; vide ou `1` = **unité de base** (une et une seule par article) |
| `quantite` | **oui** | nombre (2 décimales) | `5` ou `12,5` | Dans l'unité de la ligne, convertie en unité de base ; ENTRÉE : ajoutée ; INVENTAIRE : la somme remplace ; `0` = ligne de prix seulement |
| `prix_vente` | non (décision H14) | nombre | `4500` | Prix de l'unité de la ligne, en Ariary ; différent du prix en vigueur → nouveau prix daté (RG-ART-07) |
| `code_barres` | non | texte | `6111234567890` | Unique si renseigné ; par unité de vente (le carton peut avoir son propre code-barres) |
| `seuil_alerte` | non | nombre | `10` | En unité de base ; défaut : 0 (pas d'alerte) |
| `actif` | non | OUI / NON | `OUI` | Sur la ligne d'unité de base : active/désactive l'article ; sur une autre ligne : l'unité de vente |

Exemple :

| code | categorie | designation | unite | facteur | quantite | prix_vente |
|---|---|---|---|---|---|---|
| SAV-001 | Hygiène | Savon de Marseille 300 g | pièce | | 20 | 4500 |
| SAV-001 | | | paquet | 6 | 0 | 25000 |
| SAV-001 | | | carton | 72 | 5 | 280000 |

→ entrée de 20 + 5 × 72 = **380 pièces** ; trois unités de vente avec leur prix.

La **date d'entrée** n'est pas une colonne : elle est choisie à l'import pour tout le fichier (défaut : jour de l'import) et la date d'import est horodatée automatiquement (RG-ART-05, RG-IMP-04). La **date d'effet** des prix importés est la date de validation de l'import.

## Annexe B — Matrice des droits

`C` = créer, `L` = lire, `M` = modifier, `V` = valider, `—` = aucun. « Siens » = limité à ses propres objets.

| Fonction | Commercial | Caissier | Magasinier | Responsable | Boss | Admin |
|---|---|---|---|---|---|---|
| Catalogue, disponibilité, prix en vigueur | L | L | L | L, M | L | L |
| Unités de vente et grille de prix (créer, désactiver, nouveau prix) | — | — | — | C, M | — | L |
| Historique des prix (consulter, exporter) | — | — | — | L | L | L |
| Plafonds de remise (article, unité, catégorie) | L | L | — | L | M | L |
| Import articles (dépôt, visualisation, annulation, validation) | — | — | — | C | — | C |
| Ajustement de stock | — | — | — | C | — | C (assisté) |
| Clients (répertoire) | C, M | L, M | — | L, M (fusion) | L | L |
| Devis | C, M (siens) | L | — | L, M | L | L |
| Paniers de la borne : prendre en charge (RG-BOR-05) | C | — | — | C, M (réaffecter) | L | — |
| Commande : valider | V (siennes) | — | — | V | — | — |
| Commande : modifier avant paiement | M (siennes, avant file) | M (supprimer ligne, baisser qté) | — | M | — | — |
| Remise dans le plafond (ligne ou total) : appliquer | C | — | — | C | — | — |
| Remise exceptionnelle : demander au boss | C | C | — | C | — | — |
| Remise exceptionnelle : accorder / refuser, émettre un code, révoquer | — | — | — | — | **V, C** | — |
| Code de remise : saisir sur une commande | C | C | — | C | — | — |
| File caisse : appeler / absent | — | C | — | C | — | — |
| File livraison : appeler / absent | — | — | C | C | — | — |
| Files : réordonner, prioriser, réaffecter | — | — | — | M | — | — |
| Paiement, facture | — | C | — | C | — | — |
| Annulation avant paiement | C (siennes) | C | — | C | — | — |
| Annulation après paiement (avoir) | — | C | — | V | — | — |
| Livraison, anomalie | — | — | C | C, V | — | — |
| Retour [V1.1] | — | — | C | V | — | — |
| Session de caisse (ouvrir/clôturer) | — | C (sienne) | — | L, V [V1.1] | L | L |
| Tableau de bord | siens | siens | — | L | L | L |
| Exports | — | ses clôtures | — | L | L | L (audit) |
| Journal d'audit | — | — | — | L | L | L |
| Comptes, rôles, PIN, postes | — | — | — | — | — | C, M |
| Paramètres | — | — | — | L | L | M |
| Corrections assistées | — | — | — | — | — | C |
| Sauvegardes, restauration | — | — | — | — | — | C |
