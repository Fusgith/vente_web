# Cahier des charges MÉTIER — Vente Web

Version 0.1 — 21/09/2026 — Statut : **brouillon soumis à validation**

## 0. Comment lire ce document

- Les règles de gestion sont numérotées `RG-XXX-nn`. Elles font foi pour le code et les tests ; chaque règle doit être couverte par au moins un test automatisé une fois le développement lancé.
- `⚠️ HYPOTHÈSE` : choix fait par le consultant faute de réponse, à confirmer ou corriger. Toutes sont récapitulées au §16.
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
| Remises maîtrisées | 100 % des remises tracées ; 0 remise hors politique sans validation |
| Boss informé | Encaissements et quantités du jour consultables à distance, à jour à quelques secondes près |
| Zéro ressaisie | Facture générée automatiquement à chaque paiement |
| Continuité | Le magasin vend même sans Internet |

## 2. Périmètre

### 2.1 Dans le périmètre

- Catalogue d'articles alimenté par import Excel ; stock théorique (entrées par import, sorties par livraison, ajustements motivés).
- Parcours de vente complet : devis → commande → file caisse → paiement → facture → file livraison → remise de la marchandise.
- Politique de remise à trois niveaux avec validation.
- Appel des clients par numéro, écran public, réordonnancement par le responsable.
- Tous moyens de paiement, y compris mixte.
- Factures, devis, avoirs, bons de livraison en PDF ; exports Excel.
- Sessions et clôtures de caisse.
- Tableau de bord du boss (encaissements, quantités vendues, files en direct), accessible à distance.
- Journal d'audit complet.
- Six rôles + écran public.

### 2.2 Hors périmètre (explicitement)

- Gestion des achats, fournisseurs, commandes de réapprovisionnement.
- Trésorerie (dépenses, banque, soldes), comptabilité, paie.
- E-commerce, vente en ligne, réservation par le client.
- Multi-magasins **[V2]**, programme de fidélité avancé **[V2]**, articles à variantes (taille/couleur) **[V2]**.

> Clarification « ce n'est pas une appli de gestion de stock » : l'application tient malgré tout un **stock théorique fiable**, sinon elle ne peut pas dire au commercial ce qui est disponible. Les seules entrées sont les imports Excel ; les seules sorties sont les livraisons ; le responsable peut corriger un écart par un ajustement motivé. Rien de plus.

## 3. Acteurs et rôles

### 3.1 Les rôles

| Rôle | Où | Mission | Appareil type |
|---|---|---|---|
| **Commercial** | Surface de vente | Conseiller, construire le devis, valider la commande, remettre le numéro d'appel | Tablette Android 10" |
| **Caissier** | Caisse | Appeler, contrôler la commande et les remises, encaisser, émettre la facture, clôturer sa caisse | PC ou tablette + imprimante |
| **Magasinier** | Comptoir livraison / réserve | Préparer, appeler, remettre la marchandise, signaler les anomalies | Tablette ou PC |
| **Responsable** | Magasin | Importer les articles, définir la politique de remise, superviser les files en direct et les réordonner, valider les remises hors plafond, ajuster le stock, valider les annulations après paiement et les clôtures | PC + tablette |
| **Boss** | Partout (à distance) | Suivre encaissements, quantités vendues, files, remises, performance — en lecture | Téléphone, PC |
| **Admin** | Magasin / à distance | Créer et désactiver les comptes, attribuer les rôles, gérer les paramètres, exécuter les corrections assistées, superviser sauvegardes et restauration | PC |
| **Écran public** | Mur du magasin | Afficher les numéros appelés (pas un utilisateur : un poste sans compte) | TV + mini-PC/Chromecast |

### 3.2 Règles sur les rôles

- **RG-USR-01** Les six rôles sont fixes. L'admin crée des comptes et leur attribue un ou plusieurs rôles ; il ne crée pas de rôles. *(Un rôle dynamique impose une matrice de droits configurable, source de bugs et d'erreurs de manipulation.)*
- **RG-USR-02** Un utilisateur peut cumuler plusieurs rôles (ex. responsable + caissier). Il choisit son rôle actif à la connexion ou via un sélecteur ; le rôle actif est enregistré dans chaque action journalisée.
- **RG-USR-03** Connexion sur poste partagé (tablette, caisse) par **PIN** à 4–6 chiffres, après choix de son nom ; mot de passe complet pour l'accès à distance. Verrouillage automatique après inactivité (paramètre, défaut 5 min sur tablette, 15 min à la caisse).
- **RG-USR-04** Boss et admin : double authentification (code à usage unique) obligatoire pour tout accès depuis l'extérieur du magasin.
- **RG-USR-05** Blocage du compte 15 min après 5 tentatives échouées ; événement journalisé.
- **RG-USR-06** Un compte ne se supprime jamais, il se désactive (l'historique doit rester lisible).
- **RG-USR-07** Chaque commercial porte une **lettre de ticket** unique (paramètre du compte) ⚠️ HYPOTHÈSE, voir RG-TKT-01.

### 3.3 Ce que l'admin ne fait pas (choix volontaire)

- Pas d'écriture directe en base de données. Toute correction passe par des **écrans de correction assistée** qui produisent des mouvements compensatoires journalisés (RG-AUD-03).
- Pas de suppression de factures, paiements ou mouvements. Une erreur se corrige par un avoir ou un ajustement.
- La **remise à zéro** de la base n'est possible que sur un environnement non productif ou avant la mise en service, avec sauvegarde préalable automatique et double confirmation.

La matrice détaillée des droits est en **annexe B**.

## 4. Objets métier

| Objet | Description | Attributs clés |
|---|---|---|
| Article | Marchandise vendable | référence (unique), désignation, catégorie, unité, prix de vente, politique de remise, remise max %, seuil d'alerte, code-barres, actif |
| Stock | État quantitatif d'un article | théorique, réservé, disponible |
| Mouvement de stock | Entrée/sortie tracée | type (IMPORT, AJUSTEMENT, LIVRAISON, RETOUR), quantité signée, référence d'origine, auteur, motif, date |
| Import | Un fichier Excel traité | fichier, mode, auteur, date, lignes OK / en erreur, résumé |
| Client | Optionnel | nom, téléphone, notes |
| Devis / Commande | Même objet, états différents | numéro, état, commercial, client, ticket, lignes, totaux, remises, horodatages de chaque étape |
| Ligne | Article dans une commande | référence et désignation figées, quantité, prix unitaire figé, remise, statut de validation de la remise |
| Ticket d'appel | Numéro du client | lettre, numéro du jour, date |
| Validation de remise | Décision sur une remise | demandeur, décideur, % demandé, % accordé, motif, date |
| Session de caisse | Période d'encaissement | caisse, caissier, ouverture, fond de caisse, clôture, comptage, écarts |
| Paiement | Règlement d'une commande | lignes (moyen, montant, référence), reçu, rendu, session de caisse |
| Facture | Document légal | numéro, date, contenu figé, PDF, statut |
| Avoir | Annulation totale/partielle | numéro, facture d'origine, montant, motif, remboursement |
| Livraison | Remise physique | magasinier, poste, horodatages, anomalies |
| Journal d'audit | Trace immuable | qui, rôle, poste, quand, action, objet, avant, après, motif |
| Paramètres | Configuration | voir §13 |

## 5. Processus de vente

### 5.1 Vue d'ensemble

```
   COMMERCIAL                  CAISSE                        LIVRAISON
   ──────────                  ──────                        ─────────
   Devis (brouillon)
        │ valider
        ▼
   Commande validée ──────►  File CAISSE (rang, écran public)
   ticket A15                     │ appeler A15 → « A15 → Caisse 2 »
   stock réservé 30 min           ▼
                             Contrôle : lignes, remises
                             (validation caissier / responsable)
                                  │ encaisser (moyens multiples)
                                  ▼
                             Payée + FACTURE F-2026-000123 ─────►  File LIVRAISON
                             réservation ferme                         │ préparer
                                                                       ▼
                                                                  Prête → appel « A15 → Comptoir »
                                                                       │ remettre
                                                                       ▼
                                                                  Livrée = sortie de stock
```

### 5.2 États d'une commande

| État (FR) | Code | Signification | Sorties possibles |
|---|---|---|---|
| Devis | `DRAFT` | Brouillon, non engageant, pas de réservation | Validée · Abandonné |
| Validée (en file caisse) | `SUBMITTED` | Ticket attribué, stock réservé avec échéance | Appelée caisse · Expirée · Annulée |
| Appelée à la caisse | `AT_REGISTER` | Affichée sur l'écran public, en cours de contrôle | Payée · Retour en file (absent) · Annulée |
| Payée (à livrer) | `PAID` | Facture émise, réservation ferme | En préparation · Annulée après paiement |
| En préparation | `PREPARING` | Prise en charge par le magasinier | Prête · Anomalie |
| Prête (appelée livraison) | `READY` | Affichée sur l'écran public côté livraison | Livrée · Retour en file (absent) · Anomalie |
| Anomalie | `ISSUE` | Article manquant ou abîmé, décision du responsable attendue | Prête · Livrée partiellement + avoir |
| Livrée | `DELIVERED` | Marchandise remise, stock sorti — **état final** | Retour [V1.1] |
| Expirée | `EXPIRED` | Non payée dans le délai, réservation libérée | Réactivée (→ Validée) |
| Annulée | `CANCELLED` | Annulée avant paiement — final | — |
| Annulée après paiement | `REFUNDED` | Avoir émis — final | — |

- **RG-CMD-06** Seules les transitions du tableau sont autorisées ; toute transition est horodatée, avec son auteur, et journalisée.

### 5.3 Étape 1 — Conseil et devis (commercial)

1. Le commercial ouvre un nouveau devis (client anonyme par défaut ; nom/téléphone optionnels).
2. Il recherche les articles (texte, catégorie, scan du code-barres avec la caméra de la tablette) et voit pour chacun : prix, **stock disponible**, **politique de remise et plafond**.
3. Il ajoute des lignes, ajuste les quantités, saisit éventuellement une remise par ligne ou une remise globale. L'application indique immédiatement si la remise est libre, soumise à validation ou interdite.
4. Il peut enregistrer le devis (client qui réfléchit), l'imprimer/l'envoyer en PDF, et le reprendre plus tard.

Règles :

- **RG-DEV-01** Un devis ne réserve pas de stock et n'a pas de ticket.
- **RG-DEV-02** Numérotation `D-AAAA-nnnnnn` (trous tolérés). Validité : paramètre, défaut 7 jours ; au-delà, reprise possible avec revalorisation des prix et re-contrôle des disponibilités.
- **RG-DEV-03** Un devis peut être repris par un autre commercial (le devis reste rattaché à son créateur ; la commande porte le commercial qui valide).

### 5.4 Étape 2 — Validation de la commande (commercial)

- **RG-CMD-01** Une commande a un commercial responsable (celui qui valide). Le responsable peut la réaffecter.
- **RG-CMD-02** La validation n'est possible que si, pour chaque ligne, `disponible ≥ quantité`. Sinon, message précis par ligne (« Réf. X : 3 disponibles, 5 demandés ») et proposition de réduire la quantité.
- **RG-CMD-03** À la validation, dans une seule opération indivisible : numéro de commande, ticket d'appel (RG-TKT), réservation de stock (RG-STK-02), entrée en file caisse (RG-FIL-01), notification des caisses.
- **RG-CMD-04** Les prix unitaires et désignations sont **figés** à la validation. Un changement ultérieur du prix de l'article n'affecte pas la commande.
- **RG-CMD-05** Le commercial communique le ticket au client (affiché en gros sur la tablette ; impression d'un mini-ticket **[V1.1]**).
- **RG-CMD-07** Une commande dont une remise est « à valider » peut être validée ; la remise reste en attente et sera tranchée à la caisse (RG-REM-06).

### 5.5 Étape 3 — File d'attente caisse et appel

- **RG-FIL-01** Deux files : **CAISSE** (commandes `SUBMITTED`) et **LIVRAISON** (commandes `PAID`, `PREPARING`, `READY`). Ordre par défaut : ordre d'entrée dans la file.
- **RG-FIL-02** Le **responsable** peut réordonner (rang), marquer prioritaire, retirer ou réaffecter ; chaque modification est journalisée avec motif facultatif.
- **RG-FIL-03** Le caissier appelle en priorité le premier de la file ; il peut appeler un ticket précis si le client est devant lui (journalisé). L'appel affiche « A15 → Caisse 2 » sur l'écran public et passe la commande en `AT_REGISTER`.
- **RG-FIL-04** Client absent : le caissier clique « Absent » ; la commande revient en file **en dernière position** avec un compteur d'absences ; la réservation continue de courir (RG-STK-02). Après 2 absences, le responsable est notifié.
- **RG-FIL-05** Le temps d'attente (entrée en file → appel) et le temps de traitement (appel → paiement) sont conservés pour les statistiques.
- **RG-FIL-06** Les mêmes règles s'appliquent à la file LIVRAISON (appel par le magasinier, absence, réordonnancement).

### 5.6 Étape 4 — Contrôle et paiement (caissier)

1. Le caissier voit la commande : lignes, prix, remises avec leur statut (libre / à valider / interdite).
2. Il peut **modifier avant paiement** : supprimer une ligne, réduire une quantité, modifier une remise (RG-CMD-05b). Toute modification est journalisée avec l'état avant/après ; une augmentation de quantité déclenche un re-contrôle de stock.
3. Il tranche les remises dans son plafond ; au-delà, il **demande la validation du responsable** (notification instantanée ; le responsable valide depuis n'importe quel poste).
4. Il enregistre le paiement : un ou plusieurs moyens (RG-PAY).
5. Le paiement complet **génère la facture** (RG-FAC-01) et notifie la livraison.

- **RG-CMD-05b** Modifications autorisées à la caisse avant paiement : suppression de ligne, baisse de quantité, remise. Un ajout d'article passe par le commercial (renvoi en un clic, la commande garde son ticket).

### 5.7 Étape 5 — Facture

Voir RG-FAC. La facture est produite en PDF, imprimable en A4 et, en option, en format ticket 80 mm **[V1.1]**.

### 5.8 Étape 6 — Préparation et livraison (magasinier)

- **RG-LIV-01** Dès le paiement, la commande entre dans la file LIVRAISON ; le poste livraison est notifié (son + visuel).
- **RG-LIV-02** Le magasinier prend en charge (`PREPARING`), prépare, puis déclare **prête** : le ticket est appelé sur l'écran public (« A15 → Comptoir livraison »).
- **RG-LIV-03** À la remise, il confirme la livraison ligne par ligne (case à cocher) : la commande passe `DELIVERED` et la **sortie de stock** est enregistrée (RG-STK-04).
- **RG-LIV-04** Anomalie (article manquant, abîmé) : le magasinier signale ; état `ISSUE` ; le responsable décide : livraison partielle + avoir sur le manquant (RG-ANN-03), ou attente. La facture d'origine n'est jamais modifiée.
- **RG-LIV-05** Livraison différée : une commande payée peut rester « à livrer » (client qui revient plus tard) sans limite, avec réservation ferme. Le responsable et le boss voient la liste « payé non livré ».
- **RG-LIV-06** Bon de livraison PDF distinct **[V1.1]** ; en MVP, la facture tient lieu de bon de livraison, tamponnée ou signée physiquement si le magasin le souhaite.

### 5.9 Cas particuliers

- **RG-CMD-08 Expiration** : une commande `SUBMITTED` non payée à l'échéance de la réservation passe `EXPIRED` ; le stock est libéré ; la caisse et le commercial sont notifiés. Le commercial peut la **réactiver** : nouveau contrôle de stock, nouvelle échéance, même ticket si le jour n'a pas changé (sinon nouveau ticket).
- **RG-ANN-01 Annulation avant paiement** : par le commercial (ses commandes), le caissier ou le responsable, motif obligatoire ; réservation libérée ; ticket clos.
- **RG-ANN-02 Annulation après paiement, avant livraison** : par le caissier **avec validation du responsable** ; émet un **avoir total**, enregistre le remboursement (moyen, référence), libère la réservation ; état `REFUNDED`.
- **RG-ANN-03 Avoir partiel** : suite à une anomalie de livraison, avoir sur les lignes ou quantités non livrées ; la sortie de stock ne porte que sur le livré.
- **RG-ANN-04 Retour après livraison [V1.1]** : le magasinier enregistre le retour (article, quantité, état) ; le responsable valide ; avoir + réintégration en stock si l'article est revendable, sinon mouvement « rebut » motivé.
- **RG-ANN-05** Une facture ne se supprime ni ne se modifie jamais ; l'avoir est le seul mécanisme de correction.

## 6. Règles de gestion transverses

### 6.1 Articles et stock

- **RG-ART-01** Un article est identifié par une **référence** unique (insensible à la casse, espaces de bord ignorés). Le code-barres est optionnel mais unique s'il est renseigné.
- **RG-ART-02** Un article n'est jamais supprimé : il est **désactivé** (invisible à la vente, historique conservé).
- **RG-ART-03** Le prix de vente est modifiable par import ou par le responsable (journalisé). Les commandes déjà validées ne sont pas affectées (RG-CMD-04).
- **RG-ART-04** Quantités entières par défaut ; les décimales (jusqu'à 3) sont autorisées si l'article le permet (colonne d'import `qte_decimale = OUI`) ⚠️ HYPOTHÈSE.
- **RG-STK-01** `théorique = Σ entrées − Σ sorties` ; `disponible = théorique − réservé`. Le stock affiché au commercial est toujours le **disponible**.
- **RG-STK-02** La validation d'une commande crée une réservation par ligne, d'une durée = paramètre `reservation_ttl_minutes` (défaut **30 min**) ⚠️ HYPOTHÈSE. À l'échéance : RG-CMD-08.
- **RG-STK-03** Le paiement rend la réservation **ferme** (sans échéance) jusqu'à la livraison.
- **RG-STK-04** La sortie de stock est enregistrée **à la livraison**, pas au paiement. Conséquence : « payé non livré » = stock encore en réserve mais non disponible à la vente.
- **RG-STK-05** Ajustement manuel : responsable uniquement, motif obligatoire parmi une liste paramétrable (casse, vol, erreur d'import, inventaire…) + commentaire libre ; journalisé. Jamais de modification directe d'une quantité.
- **RG-STK-06** Le stock théorique ne peut pas devenir négatif. Une sortie qui le rendrait négatif est refusée avec message.
- **RG-STK-07** Alerte (responsable, boss) quand `disponible ≤ seuil d'alerte` de l'article.

### 6.2 Remises

- **RG-REM-01** Chaque article porte une politique : **LIBRE** (remise autorisée jusqu'à `remise_max_pct` sans validation), **VALIDATION** (toute remise > 0 doit être validée), **INTERDIT** (aucune remise). Valeur par défaut d'un article importé sans colonne : paramètre `default_discount_policy` (défaut : VALIDATION).
- **RG-REM-02** Le commercial voit la politique et le plafond de chaque article **avant** de proposer quoi que ce soit au client ; l'interface l'empêche de saisir une remise sur un article INTERDIT.
- **RG-REM-03** Plafonds d'approbation par rôle (paramètres) : commercial = plafond de l'article en LIBRE, 0 sinon ; caissier = jusqu'à `cashier_max_discount_pct` (défaut **10 %**) ⚠️ HYPOTHÈSE ; responsable = sans plafond, motif obligatoire.
- **RG-REM-04** Remise saisissable en % ou en montant ; le contrôle s'effectue toujours sur l'équivalent en %. Une **remise globale** est répartie au prorata sur les lignes remisables ; les lignes INTERDIT en sont exclues.
- **RG-REM-05** Motif obligatoire (liste paramétrable + texte libre) pour toute remise qui dépasse le niveau libre.
- **RG-REM-06** Une remise en attente de validation **bloque le paiement** jusqu'à décision : approuvée, modifiée (le décideur fixe un autre %) ou refusée. La décision, son auteur et l'heure sont journalisés et visibles sur la commande.
- **RG-REM-07** Les remises approuvées apparaissent sur la facture ligne par ligne et en total.

### 6.3 Ticket d'appel

- **RG-TKT-01** Ticket = **lettre** + **numéro**. Lettre = celle du commercial qui valide (permet à la caisse de savoir qui a vendu) ⚠️ HYPOTHÈSE. Numéro = séquence quotidienne **par lettre**, démarrant à 1 chaque jour à 00:00 (heure d'Antananarivo).
- **RG-TKT-02** Un ticket est unique dans la journée et suit la commande jusqu'à la livraison.
- **RG-TKT-03** L'affichage du ticket est grand et lisible à 5 m sur l'écran public.

### 6.4 Paiements

- **RG-PAY-01** Les moyens de paiement forment une liste paramétrable (libellé, actif, référence obligatoire, ordre). Valeurs initiales : **Espèces, MVola, Orange Money, Airtel Money, Carte bancaire, Virement, Chèque**.
- **RG-PAY-02** Paiement **mixte** : plusieurs lignes de paiement ; la somme doit être exactement égale au total dû (après rendu monnaie sur la partie espèces).
- **RG-PAY-03** Espèces : montant reçu saisi ; rendu = reçu − dû sur la partie espèces ; enregistré et imprimé sur la facture.
- **RG-PAY-04** Référence de transaction obligatoire pour mobile money, virement, chèque et carte (paramétrable par moyen).
- **RG-PAY-05** Paiement partiel / acompte : **désactivé par défaut** (paramètre `allow_partial_payment`) **[V1.1]**. Si activé : reçu d'acompte numéroté, état `PARTIALLY_PAID`, facture émise et livraison possible uniquement au solde.
- **RG-PAY-06** Un paiement enregistré ne se modifie pas. Une erreur se corrige par annulation après paiement (RG-ANN-02) puis nouvelle commande.
- **RG-PAY-07** Tout paiement est rattaché à une session de caisse ouverte (RG-CAI-02).

### 6.5 Factures, avoirs, TVA

- **RG-FAC-01** Numéro de facture **séquentiel par année, sans trou** : `F-AAAA-nnnnnn` (préfixe paramétrable). Attribué au moment exact du paiement complet, dans la même opération indivisible. Jamais réutilisé, jamais modifié.
- **RG-FAC-02** Contenu figé : mentions légales du magasin, numéro, date/heure, ticket, commercial, caissier, client (si renseigné), lignes (référence, désignation, quantité, unité, PU, remise, total ligne), total brut, total remises, [HT / TVA / TTC si TVA active], net à payer, lignes de paiement (moyen, référence, montant), reçu et rendu, pied de page paramétrable.
- **RG-FAC-03** TVA : paramètres `vat_enabled` (défaut **non**), `vat_rate` (défaut 20 %), `prices_include_vat` (défaut oui). Si désactivée : aucune ligne TVA, mention paramétrable (ex. « TVA non applicable »).
- **RG-FAC-04** Le PDF est généré et **stocké** à l'émission ; toute réimpression restitue le même fichier (jamais régénéré avec les paramètres du moment).
- **RG-FAC-05** Avoir : `AV-AAAA-nnnnnn`, séquentiel sans trou, référence la facture d'origine, motif, remboursement (moyen, référence, montant).
- **RG-FAC-06** Devis PDF : mention « Devis — valable jusqu'au JJ/MM/AAAA — ne vaut pas facture ».
- **RG-FAC-07** Mentions légales paramétrables : raison sociale, adresse, téléphone, NIF, STAT, RCS, logo, texte de pied de page. ⚠️ HYPOTHÈSE : à vérifier avec le comptable du magasin pour les obligations malgaches.

### 6.6 Sessions et clôtures de caisse

- **RG-CAI-01** Une session s'ouvre par caissier sur une caisse donnée avec un **fond de caisse** saisi. Tous les paiements enregistrés pendant la session y sont rattachés.
- **RG-CAI-02** Une seule session ouverte par caissier à la fois ; impossible d'encaisser sans session ouverte.
- **RG-CAI-03** Clôture : l'application calcule le **théorique par moyen de paiement** ; le caissier saisit le comptage espèces ; l'écart est calculé, un commentaire est obligatoire si écart ≠ 0. Rapport de clôture PDF/Excel.
- **RG-CAI-04** Validation de la clôture par le responsable **[V1.1]** ; en MVP la clôture est consultable par le responsable et le boss dès qu'elle est faite.
- **RG-CAI-05** Une session oubliée ouverte est signalée au responsable le lendemain matin.

### 6.7 Formats

- **RG-FMT-01** Montants : `1 250 000,00 Ar` — espace insécable pour les milliers, virgule décimale, **2 décimales**, symbole « Ar » après le nombre. Calculs et stockage avec 2 décimales, arrondi au plus proche (demi-supérieur).
- **RG-FMT-02** Dans les exports Excel, les montants et quantités sont des **nombres** (pas du texte) avec le format d'affichage appliqué.
- **RG-FMT-03** Dates : `JJ/MM/AAAA`, heures `HH:MM`, fuseau **Indian/Antananarivo (UTC+3)**.
- **RG-FMT-04** Paramètre optionnel `cash_rounding` (défaut : aucun) pour arrondir le net à payer en espèces (ex. à 100 Ar) ; l'arrondi apparaît comme une ligne distincte sur la facture.

### 6.8 Journal d'audit

- **RG-AUD-01** Journal **immuable** (ajout seul) : horodatage, utilisateur, rôle actif, poste, action, objet concerné, état avant, état après, motif. Consultable par admin, responsable et boss ; exportable.
- **RG-AUD-02** Événements journalisés au minimum : connexion/déconnexion et échecs ; création, validation, modification, annulation, expiration, réactivation de commande ; toute remise et toute décision de remise ; paiement, facture, avoir ; appel, absence, réordonnancement de file ; import, ajustement, livraison, anomalie, retour ; ouverture et clôture de caisse ; modification de paramètre, de compte, de prix ; correction assistée.
- **RG-AUD-03** Les corrections de l'admin passent par des écrans dédiés qui produisent des opérations compensatoires (ajustement, avoir, réaffectation) — jamais d'écriture directe.

## 7. Files d'attente et écran public

- **RG-DSP-01** L'écran public affiche en temps réel, par file, les **5 derniers tickets appelés** avec le poste (« A15 → Caisse 2 », « C22 → Comptoir »), le dernier appel en surbrillance, en très gros caractères.
- **RG-DSP-02** Signal sonore optionnel à chaque nouvel appel (paramètre).
- **RG-DSP-03** L'écran public se connecte avec une **clé de poste** (URL dédiée), sans compte utilisateur, en lecture seule ; il se reconnecte seul après coupure.
- **RG-DSP-04** Le responsable dispose d'une **vue de supervision en direct** : les deux files avec rang, ticket, commercial, montant, temps d'attente, statut des remises ; glisser-déposer pour réordonner ; indicateurs de la journée (attente moyenne, commandes en cours, payé non livré).

## 8. Import Excel des articles

- **RG-IMP-01** Modèle de fichier figé (annexe A), téléchargeable depuis l'application, première ligne = en-têtes. Formats acceptés : `.xlsx` (et `.csv` UTF-8) ⚠️ HYPOTHÈSE.
- **RG-IMP-02** Deux modes : **ENTRÉE** (défaut) — la quantité du fichier **s'ajoute** au stock ; **INVENTAIRE** — la quantité du fichier **remplace** le stock théorique (responsable, double confirmation, chaque écart devient un ajustement motivé « inventaire »).
- **RG-IMP-03** Référence connue → mise à jour des attributs renseignés (colonnes vides = inchangé) + mouvement de stock ; référence inconnue → création.
- **RG-IMP-04** **Prévisualisation obligatoire** avant import : nombre de créations, mises à jour, quantités entrantes, et liste des erreurs ligne par ligne (référence manquante, doublon dans le fichier, prix non numérique, quantité négative, politique inconnue…).
- **RG-IMP-05** Import **tout ou rien** par défaut ; option « importer uniquement les lignes valides » avec rapport des lignes ignorées.
- **RG-IMP-06** Chaque import est historisé : fichier conservé, auteur, date, mode, résumé, mouvements générés. Un import ne s'annule pas ; on le corrige par un import inverse ou des ajustements.
- **RG-IMP-07** Import réservé au **responsable** (et à l'admin).

## 9. Exports Excel

- **RG-EXP-01** Exports disponibles (filtres par période, article, acteur selon le cas) : mouvements de stock ; état du stock (théorique, réservé, disponible, valeur au prix de vente) ; ventes (factures et lignes) ; encaissements par moyen de paiement ; remises accordées ; clôtures de caisse ; journal d'audit ; files d'attente et temps d'attente.
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

- **RG-PDF-01** Impression depuis le navigateur (dialogue d'impression) en MVP ; impression directe sur imprimante thermique via le serveur **[V1.1]**.

## 11. Tableau de bord du boss

Accessible à distance sur téléphone et PC, en lecture seule, actualisé en temps réel.

- **RG-DSH-01** Indicateurs du jour (et sur toute période choisie) : **total encaissé** et détail **par moyen de paiement** ; nombre de factures ; **quantités vendues** (total, par article, par catégorie) ; panier moyen ; remises accordées (montant, % du brut) ; avoirs ; ventes par commercial ; ventes par heure.
- **RG-DSH-02** Files en direct : nombre en attente caisse / livraison, temps d'attente moyen et maximum du jour, payé non livré.
- **RG-DSH-03** Stock : articles sous le seuil d'alerte, top 20 des ventes avec disponible restant.
- **RG-DSH-04** Comparaisons : veille, même jour de la semaine précédente, semaine, mois.
- **RG-DSH-05** Notifications au boss **[V1.1]** : résumé de fin de journée, remise supérieure à un seuil, clôture avec écart, stock sous seuil.
- **RG-DSH-06** Le responsable voit le même tableau de bord, limité au magasin, plus la supervision des files (RG-DSP-04).

## 12. Historique

- Fiche commande : chronologie complète (création, validation, appels, remises, paiement, facture, livraison) avec acteur et heure.
- Fiche article : mouvements de stock et ventes.
- Fiche utilisateur : activité (commandes, paiements, décisions).
- Journal d'audit global filtrable (RG-AUD).

## 13. Paramètres (admin)

| Clé | Défaut | Description |
|---|---|---|
| `store.legal` | — | Raison sociale, adresse, téléphone, NIF, STAT, RCS, logo, pied de page |
| `currency` | MGA | Devise (fixe) |
| `vat_enabled` / `vat_rate` / `prices_include_vat` | non / 20 % / oui | TVA optionnelle |
| `cash_rounding` | aucun | Arrondi espèces (RG-FMT-04) |
| `invoice_prefix` / `credit_note_prefix` / `quote_prefix` | F / AV / D | Préfixes de numérotation |
| `reservation_ttl_minutes` | 30 | Durée de réservation avant expiration |
| `quote_validity_days` | 7 | Validité d'un devis |
| `default_discount_policy` / `default_max_discount_pct` | VALIDATION / 0 | Politique par défaut à l'import |
| `cashier_max_discount_pct` | 10 | Plafond d'approbation du caissier |
| `discount_reasons` / `adjustment_reasons` | listes | Motifs proposés |
| `payment_methods` | 7 moyens | Liste, référence obligatoire, ordre |
| `allow_partial_payment` | non | Acomptes [V1.1] |
| `display.sound` / `display.last_calls` | oui / 5 | Écran public |
| `session.lock_minutes.tablet` / `.register` | 5 / 15 | Verrouillage inactivité |
| `stations` | — | Liste des postes (caisses, comptoirs, écrans) |

## 14. Exigences non fonctionnelles (vue métier)

- **Simplicité** : un commercial doit créer une commande de 5 lignes en moins d'une minute après une heure de formation. Boutons larges, lisibles au soleil, utilisables au doigt.
- **Réactivité** : toute action courante répond en moins d'une seconde sur le réseau local ; un appel apparaît sur l'écran public en moins de deux secondes.
- **Continuité** : le magasin fonctionne sans Internet (serveur local). Sans Wi-Fi local, rien ne fonctionne : le Wi-Fi du magasin est une infrastructure critique (onduleur, point d'accès de secours).
- **Perte de données** : au plus 15 minutes en cas de sinistre (sauvegarde cloud), reprise en moins de 2 heures sur une machine de secours.
- **Volumes cibles** : ≤ 30 utilisateurs simultanés, ≤ 2 000 commandes/jour, ≤ 50 000 articles, 10 ans d'historique consultables.
- **Langue** : français ; nombres et dates au format malgache/français (§6.7).
- **Appareils** : tablettes Android 10" (Chrome), PC Windows (Chrome/Edge), téléphone (Android/iOS) pour le boss, TV avec navigateur pour l'écran public.

## 15. Priorisation

| Lot | Contenu |
|---|---|
| **[MVP]** — première mise en service | Comptes et rôles, PIN, 2FA boss/admin · Import articles (ENTRÉE et INVENTAIRE) · Catalogue, disponibilité, réservation, expiration · Devis, commande, ticket, remises 3 niveaux avec validation · Files caisse et livraison, écran public, supervision et réordonnancement · Paiement multi-moyens, facture PDF A4, avoir total/partiel · Sessions et clôture de caisse simple · Livraison, sortie de stock, anomalies · Exports (mouvements, ventes, encaissements, stock, audit) · Tableau de bord boss (RG-DSH-01 à 04) · Journal d'audit · Déploiement magasin (serveur local, tunnel, DNS, sauvegardes, onduleur) |
| **[V1.1]** | Retours après livraison · Bon de livraison · Ticket 80 mm et impression thermique directe · Mini-ticket d'appel imprimé · Paiement partiel / acompte · Validation des clôtures par le responsable · Notifications au boss · Fiche client enrichie (historique) |
| **[V2]** | Réplique cloud en lecture seule (tableau de bord même magasin hors ligne) · Multi-magasins · Articles à variantes · Fidélité · Application APK/TWA si un besoin réel apparaît |

## 16. Hypothèses à valider ⚠️

| # | Hypothèse | Règle | Alternative |
|---|---|---|---|
| H1 | Un seul magasin en V1 | §2.2 | Multi-magasins dès le départ → change l'architecture (ADR-0001) |
| H2 | Lettre du ticket = commercial qui valide | RG-TKT-01 | Lettre = type de vente, ou lettre unique + numéro global |
| H3 | Durée de réservation 30 min | RG-STK-02 | 15 / 60 min ; ou pas d'expiration (risque de stock bloqué) |
| H4 | Plafond d'approbation caissier 10 % | RG-REM-03 | Autre valeur ; ou caissier sans pouvoir d'approbation |
| H5 | Politique de remise par défaut = VALIDATION | RG-REM-01 | LIBRE avec plafond, ou INTERDIT |
| H6 | Sortie de stock à la livraison (pas au paiement) | RG-STK-04 | Sortie au paiement (plus simple, mais « payé non livré » invisible en stock) |
| H7 | Quantités entières par défaut, décimales sur option | RG-ART-04 | Toujours entières |
| H8 | Import `.xlsx` (+ `.csv`), tout ou rien | RG-IMP-01/05 | `.xls` ancien format à supporter ? |
| H9 | Mentions légales : NIF, STAT, RCS | RG-FAC-07 | À confirmer avec le comptable |
| H10 | Impression navigateur en MVP, thermique en V1.1 | RG-PDF-01 | Thermique dès le MVP si les tickets 80 mm sont indispensables |
| H11 | Nombre de postes : 3–5 tablettes, 1–2 caisses, 1 comptoir livraison, 1 écran | §14 | À préciser (dimensionnement Wi-Fi et matériel) |
| H12 | Client anonyme par défaut | §5.3 | Nom/téléphone obligatoires |
| H13 | Le boss ne modifie rien (lecture seule) | §3.1 | Boss = responsable + boss (cumul de rôles possible, RG-USR-02) |

## Annexe A — Modèle Excel d'import des articles

| Colonne | Obligatoire | Type | Exemple | Remarque |
|---|---|---|---|---|
| `reference` | oui | texte | `SAV-001` | Clé unique (RG-ART-01) |
| `designation` | oui (à la création) | texte | `Savon de Marseille 300 g` | |
| `categorie` | non | texte | `Hygiène` | Créée si inconnue |
| `unite` | non | texte | `pièce` | Défaut : pièce |
| `prix_vente` | oui (à la création) | nombre | `4500` | En Ariary, 2 décimales max |
| `quantite` | oui | nombre | `120` | ENTRÉE : ajoutée ; INVENTAIRE : remplace |
| `politique_remise` | non | LIBRE / VALIDATION / INTERDIT | `LIBRE` | Défaut : paramètre |
| `remise_max_pct` | non | nombre | `5` | Utilisée si LIBRE |
| `code_barres` | non | texte | `6111234567890` | Unique si renseigné |
| `seuil_alerte` | non | nombre | `10` | Défaut : 0 (pas d'alerte) |
| `qte_decimale` | non | OUI / NON | `NON` | RG-ART-04 |
| `actif` | non | OUI / NON | `OUI` | NON = désactive l'article |

## Annexe B — Matrice des droits

`C` = créer, `L` = lire, `M` = modifier, `V` = valider, `—` = aucun. « Siens » = limité à ses propres objets.

| Fonction | Commercial | Caissier | Magasinier | Responsable | Boss | Admin |
|---|---|---|---|---|---|---|
| Catalogue, disponibilité | L | L | L | L, M (prix) | L | L |
| Import articles | — | — | — | C | — | C |
| Ajustement de stock | — | — | — | C | — | C (assisté) |
| Devis | C, M (siens) | L | — | L, M | L | L |
| Commande : valider | V (siennes) | — | — | V | — | — |
| Commande : modifier avant paiement | M (siennes, avant file) | M (lignes, remises) | — | M | — | — |
| Remise : proposer | C (dans politique) | C | — | C | — | — |
| Remise : approuver | — | V (≤ plafond) | — | V | — | — |
| File caisse : appeler / absent | — | C | — | C | — | — |
| File livraison : appeler / absent | — | — | C | C | — | — |
| Files : réordonner, prioriser | — | — | — | M | — | — |
| Paiement, facture | — | C | — | C | — | — |
| Annulation avant paiement | C (siennes) | C | — | C | — | — |
| Annulation après paiement (avoir) | — | C | — | V | — | — |
| Livraison, anomalie | — | — | C | C, V | — | — |
| Retour [V1.1] | — | — | C | V | — | — |
| Session de caisse (ouvrir/clôturer) | — | C (sienne) | — | L, V [V1.1] | L | L |
| Tableau de bord | siens | siens | — | L | L | L |
| Exports | — | ses clôtures | — | L | L | L (audit) |
| Journal d'audit | — | — | — | L | L | L |
| Comptes, rôles, PIN | — | — | — | — | — | C, M |
| Paramètres | — | — | — | L | L | M |
| Corrections assistées | — | — | — | — | — | C |
| Sauvegardes, restauration | — | — | — | — | — | C |
