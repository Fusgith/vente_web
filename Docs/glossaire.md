# Glossaire FR ↔ EN

Le code utilise les termes anglais de la colonne « Code » (ADR-0004). L'interface et la documentation utilisent le français.

| Français | Code (EN) | Définition |
|---|---|---|
| Article | `product` | Marchandise vendable, identifiée par une référence unique. |
| Référence | `sku` | Identifiant métier unique d'un article (issu de l'Excel). |
| Code-barres | `barcode` | Code scannable optionnel, unique s'il est renseigné. |
| Catégorie | `category` | Regroupement d'articles. |
| Unité | `unit` | Unité de vente (pièce, kg, lot…). |
| Stock théorique | `on_hand` | Somme des entrées moins somme des sorties. |
| Stock réservé | `reserved` | Quantité bloquée par des commandes validées non livrées. |
| Stock disponible | `available` | `on_hand - reserved`. |
| Mouvement de stock | `stock_movement` | Entrée ou sortie datée, typée, tracée. |
| Réservation | `reservation` | Blocage temporaire ou ferme de quantité pour une commande. |
| Ajustement | `adjustment` | Mouvement correctif manuel avec motif (responsable). |
| Inventaire | `stocktake` | Import en mode remplacement des quantités. |
| Import (lot) | `import_batch` | Un fichier Excel importé, avec son résultat. |
| Client | `customer` | Personne (optionnelle) rattachée à un devis ou une commande. |
| Devis | `quote` | Commande à l'état brouillon, non engageante. |
| Commande | `order` | Devis validé par le commercial ; porte le ticket d'appel. |
| Ligne de commande | `order_line` | Article × quantité × prix figé × remise. |
| Ticket d'appel | `ticket` | Code « lettre + numéro » (A15) appelé à la caisse et à la livraison. |
| File d'attente | `queue` | Liste ordonnée des commandes en attente (caisse ou livraison). |
| Rang | `queue_rank` | Position dans la file, modifiable par le responsable. |
| Appel | `call` | Action d'afficher un ticket sur l'écran public avec le poste. |
| Absent | `no_show` | Client appelé qui ne s'est pas présenté. |
| Remise | `discount` | Réduction en % ou en montant, sur une ligne ou globale. |
| Politique de remise | `discount_policy` | `FREE` (libre jusqu'à un plafond) / `APPROVAL` (soumise à validation) / `FORBIDDEN` (interdite). |
| Validation de remise | `discount_approval` | Décision d'un caissier ou du responsable sur une remise proposée. |
| Poste | `station` | Point physique : caisse 1, comptoir livraison, tablette, écran public. |
| Caisse | `register` | Poste d'encaissement. |
| Session de caisse | `register_session` | Période ouverte par un caissier sur une caisse, avec fond de caisse. |
| Clôture de caisse | `register_closing` | Comptage de fin de session, écarts, rapport. |
| Paiement | `payment` | Règlement total d'une commande, composé d'une ou plusieurs lignes. |
| Ligne de paiement | `payment_line` | Un moyen × un montant × une référence. |
| Moyen de paiement | `payment_method` | Espèces, MVola, Orange Money, Airtel Money, carte, virement, chèque… |
| Rendu monnaie | `change` | Montant rendu au client sur un paiement en espèces. |
| Facture | `invoice` | Document légal numéroté sans trou, émis au paiement. |
| Avoir | `credit_note` | Document annulant tout ou partie d'une facture. |
| Bon de livraison | `delivery_note` | Document listant la marchandise remise. |
| Livraison | `delivery` | Remise physique de la marchandise au client (sortie de stock). |
| Anomalie de livraison | `delivery_issue` | Article manquant ou abîmé constaté au moment de la remise. |
| Retour | `return` | Marchandise rapportée après livraison. |
| Journal d'audit | `audit_log` | Trace immuable de toute opération sensible. |
| Paramètres | `settings` | Configuration modifiable par l'admin. |
| Écran public | `public_display` | Affichage des numéros appelés, sans compte. |
| Tableau de bord | `dashboard` | Indicateurs du boss et du responsable. |
| TVA | `vat` | Taxe optionnelle. |
| Ariary | `MGA` | Devise (code ISO 4217). |
| Admin | rôle `admin` | Comptes, paramètres, corrections assistées, sauvegardes. |
| Responsable | rôle `manager` | Import, politique de remise, files, ajustements, validations. |
| Commercial | rôle `sales` | Devis et commandes sur tablette. |
| Caissier | rôle `cashier` | Contrôle, paiement, facture, session de caisse. |
| Magasinier | rôle `warehouse` | Préparation et remise de la marchandise. |
| Boss | rôle `owner` | Tableau de bord et rapports, en lecture, à distance. |
