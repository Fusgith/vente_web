# Glossaire FR ↔ EN

Le code utilise les termes anglais de la colonne « Code » (ADR-0004). L'interface et la documentation utilisent le français.

| Français | Code (EN) | Définition |
|---|---|---|
| Article | `product` | Marchandise vendable, identifiée par un code unique. |
| Code article (référence) | `sku` | Identifiant métier unique d'un article (colonne `code` de l'Excel). |
| Code-barres | `barcode` | Code scannable optionnel, unique s'il est renseigné. |
| Catégorie | `category` | Regroupement d'articles. |
| Unité de base (unité de comptage) | `base_unit` | Unité dans laquelle le stock de l'article est compté (pièce, kg, m, litre…) ; quantités décimales. Toute quantité vendue y est convertie. |
| Unité de vente | `product_unit` | Conditionnement dans lequel l'article se vend (pièce, paquet, carton…), avec son facteur et son prix ; un article en a une ou plusieurs. |
| Facteur (de conversion) | `factor` | Nombre d'unités de base contenues dans une unité de vente (1 pour l'unité de base ; carton de 12 = 12). |
| Grille de prix | `price_list` | Ensemble des unités de vente d'un article avec leur prix en vigueur. |
| Prix (historisé) | `product_price` | Une valeur de prix d'une unité de vente, avec date d'effet et date de fin ; jamais écrasée. |
| Prix en vigueur | `current_price` | Le prix dont la date d'effet est passée et qui n'a pas de date de fin. |
| Date d'effet | `effective_from` | Date à partir de laquelle un prix s'applique. |
| Historique des prix | `price_history` | Suite des prix d'une unité de vente dans le temps, avec origine (import, saisie) et auteur. |
| Quantité en unité de base | `base_qty` | Quantité d'une ligne convertie (`qty × factor`) ; sert à la réservation et à la sortie de stock. |
| Stock théorique | `on_hand` | Somme des entrées moins somme des sorties. |
| Stock réservé | `reserved` | Quantité bloquée par des commandes validées non livrées. |
| Stock disponible | `available` | `on_hand - reserved`. |
| Mouvement de stock | `stock_movement` | Entrée ou sortie datée, typée, tracée. |
| Réservation | `reservation` | Blocage temporaire ou ferme de quantité pour une commande. |
| Ajustement | `adjustment` | Mouvement correctif manuel avec motif (responsable). |
| Inventaire | `stocktake` | Import en mode remplacement des quantités. |
| Import (lot) | `import_batch` | Un fichier Excel importé : prévisualisé, puis validé ou annulé ; porte la date d'import et la date d'entrée. |
| Client | `customer` | Personne rattachée à un devis ou une commande ; nom et téléphone obligatoires. |
| Devis | `quote` | Commande à l'état brouillon, non engageante. |
| Commande | `order` | Devis validé par le commercial ; porte le ticket d'appel. |
| Ligne de commande | `order_line` | Article × unité de vente × quantité × prix figé × remise ; porte aussi la quantité en unité de base. |
| Valider (un devis en commande) | `submit` | Passage du devis à la commande : prix figés, stock réservé, ticket, entrée en file caisse (RG-CMD-03). |
| Stock insuffisant | `stock_shortage` | Article dont une commande demande plus que le disponible ; la validation est refusée (RG-CMD-02). |
| Ticket d'appel | `ticket` | Code « lettre + numéro » (A15) appelé à la caisse et à la livraison. |
| File d'attente | `queue` | Liste ordonnée des commandes en attente (caisse ou livraison). |
| Rang | `queue_rank` | Position dans la file, modifiable par le responsable. |
| Appel | `call` | Action d'annoncer un ticket : sur l'écran public avec le poste, ou de vive voix (ticket + nom du client). |
| Absent | `no_show` | Client appelé qui ne s'est pas présenté. |
| Remise | `discount` | Réduction saisie en % ou directement en montant, sur une ligne (produit par produit) et/ou sur le total du devis ; total des remises = remises des lignes + remise sur le total (RG-REM-06). |
| Remise sur le total | `order_discount` | Remise sur le sous-total du devis, bornée sans code par la marge de remise restante, répartie sur les lignes (RG-REM-06). |
| Marge de remise restante | `discount_headroom` | Somme, sur les lignes, de (plafond × brut − remise de la ligne) : maximum de la remise sur le total sans code du boss. |
| Plafond de remise | `max_discount_pct` | Remise maximale applicable sans le boss ; définie par unité de vente, sinon par article, sinon par catégorie, sinon paramètre global (0 = interdite). |
| Demande de remise exceptionnelle | `discount_request` | Demande adressée au boss pour dépasser le plafond ; accordée ou refusée par lui seul. |
| Notification push | `push` | Message que le serveur fait parvenir au téléphone du boss par le service de push du navigateur, application fermée (RG-DSH-05, H55). |
| Abonnement (aux notifications) | `push_subscription` | Appareil sur lequel le boss a activé les notifications push : adresse du service de push et clés de chiffrement ; 10 au plus par compte. |
| Code de remise | `discount_code` | Code à usage unique émis par le boss, qui applique une remise au-delà du plafond ; expire en fin de journée. Depuis H64 (⚠️ hypothèse), celui d'un accord n'est plus affiché. |
| Code promo | `promo_code` | ⚠️ H63 : code de remise émis par le boss pour un prochain achat d'un client, valable jusqu'à une date choisie ; saisi à la caisse (`discount_code` de genre `PROMO`). |
| Remises du commercial (paramètre) | `sales_discount_enabled` | ⚠️ H60 : l'admin autorise ou non le commercial à remiser ; désactivé par défaut. |
| Règle de remise | `discount_rule` | ⚠️ H62 : remise prévue par le boss (quantité, catégorie de client, type de client, promotion), en %, sur tout, une catégorie d'articles ou un article. |
| Remise prévue | `suggested_discount` | ⚠️ H62 : taux de la meilleure règle qui concerne une ligne ; appliquée par le caissier à la demande du client. |
| Type de client | `customer_type` | ⚠️ H66 : Grossiste (`WHOLESALER`), Semi-grossiste (`SEMI_WHOLESALER`), Détaillant (`RETAILER`), Particulier (`INDIVIDUAL`) ; fixe le prix. |
| Prix de base | `base_price` | ⚠️ H66 : prix d'une unité de vente sans type de client ; s'applique à défaut de prix pour le type. |
| Conditions de crédit | `credit_terms` | ⚠️ H67 : plafond d'encours et durée, par type, catégorie ou client. |
| Vente à crédit | `credit_sale` | ⚠️ H67 : vente conclue (facture, livraison) dont tout ou partie reste dû. |
| Créance | `receivable` | ⚠️ H67 : reste dû d'une vente, avec échéance ; réglée ensuite à la caisse. |
| Encours | `outstanding` | ⚠️ H67 : total des créances ouvertes d'un client. |
| Règlement (d'une créance) | `settlement` | ⚠️ H67 : paiement ultérieur d'une créance, avec reçu numéroté. |
| Traite | `bill_of_exchange` | ⚠️ H68 : titre de paiement à échéance (numéro, tiré, échéance). |
| Chèque post-daté | `postdated_check` | ⚠️ H68 : chèque à encaisser à sa date. |
| Titre (à encaisser) | `payment_instrument` | ⚠️ H68 : traite ou chèque post-daté reçu : REMIS, ENCAISSÉ ou IMPAYÉ. |
| Remplacé (devis, commande) | `REPLACED` / `replaced_by` | ⚠️ H69 : devis remis ou commande validée modifié(e), refait(e) sous un nouveau numéro. |
| Remis (devis) | `handed_over_at` | ⚠️ H69 : devis dont le PDF a été ouvert ; il ne se modifie plus. |
| Poste | `station` | Point physique déclaré par l'admin : tablette, caisse, comptoir de livraison, écran public, borne ; nombre libre. |
| Caisse | `register` | Poste d'encaissement. |
| Session de caisse | `register_session` | Période ouverte par un caissier sur une caisse, avec fond de caisse. |
| Clôture de caisse | `register_closing` | Comptage de fin de session, écarts, rapport. |
| Espèces attendues | `cash_expected` | Fond de caisse + part des paiements en espèces : ce que le tiroir doit contenir. |
| Écart de caisse | `variance` | Espèces comptées − espèces attendues. |
| Session oubliée | `forgotten` | Session de caisse encore ouverte, ouverte un jour précédent (RG-CAI-05). |
| Paiement | `payment` | Règlement total d'une commande, composé d'une ou plusieurs lignes. |
| Ligne de paiement | `payment_line` | Un moyen × un montant × une référence. |
| Moyen de paiement | `payment_method` | Espèces, MVola, Orange Money, Airtel Money, carte, virement, chèque, traite et chèque post-daté (⚠️ H68)… |
| Rendu monnaie | `change` | Montant rendu au client sur un paiement en espèces. |
| Fond de caisse | `opening_float` | Espèces dans le tiroir à l'ouverture de la session de caisse. |
| Montant reçu | `cash_received` | Espèces remises par le client ; rendu = reçu − part en espèces. |
| Clé d'idempotence | `idempotency_key` | Identifiant donné par l'écran à un paiement : renvoyé, il n'en crée pas un second. |
| Encaisser | `pay` | Enregistrer le paiement de la commande à la caisse. |
| Facture | `invoice` | Document légal numéroté sans trou, émis au paiement. |
| Contenu figé (facture) | `snapshot` | Tout ce que la facture imprime, fixé à l'émission ; le PDF n'est fait que depuis lui. |
| Mention TVA | `vat_notice` | Texte imprimé sur la facture quand la TVA est désactivée. |
| Avoir | `credit_note` | Document annulant tout ou partie d'une facture. |
| Rembourser (une vente payée) | `refund` | Annuler une commande payée avant livraison : avoir, remboursement depuis la caisse (`REFUNDED`). |
| Validation du responsable | `approval` | Nom et PIN du responsable tapés sur place pour autoriser une opération (avoir). |
| Bon de livraison | `delivery_note` | Document listant la marchandise remise. |
| Livraison | `delivery` | Remise physique de la marchandise au client (sortie de stock). |
| Prendre en charge (livraison) | `take` | Le magasinier prend une commande payée à son nom pour la préparer (`PREPARING`). |
| Prête | `ready` | Commande préparée, ticket appelé au comptoir (`READY`). |
| Remettre en file | `release` | Le responsable rend à la file une commande en préparation ou prête, pour un autre comptoir. |
| Anomalie de livraison | `delivery_issue` | Article manquant ou abîmé constaté au moment de la remise. |
| Retour | `return` | Marchandise rapportée après livraison. |
| Journal d'audit | `audit_log` | Trace immuable de toute opération sensible. |
| Paramètres | `settings` | Configuration modifiable par l'admin. |
| Écran public | `public_display` | Affichage des numéros appelés, sans compte ; optionnel (0 ou 1). |
| Borne libre-service | `kiosk` | Poste sans compte où le client compose lui-même son panier, repris ensuite par un commercial (§5.10). |
| Panier (de borne) | `basket` | Devis créé à la borne, numéroté « P12 » dans la journée, en attente de reprise par un commercial. |
| Recherche rapide | `quick_search` | Champ unique code / code-barres / désignation, ajout direct sur code exact, scan en rafale (RG-DEV-06). |
| Espace de travail | `workspace` | Écrans d'un rôle actif (Ventes, Caisse, Livraison, Supervision, Tableau de bord, Administration) ; sa couleur est celle du cadre (ADR-0005). |
| Cadre (lamba) | `frame` | Bordure de chaque écran : bandeau haut, liseré imprimé, bandeau bas ; sa couleur désigne l'espace de travail (ADR-0005). |
| Ligne d'état | `status_line` | Bandeau bas du cadre : la seule phrase d'état de l'écran (« Ajouté : … », erreurs). |
| Nom de l'application | `app_name` | Nom affiché de l'application, fixé à la construction (RG-APP-01, ADR-0006) ; distinct de la raison sociale. |
| Version distribuable | `dist` | Application construite au nom voulu, rangée dans `Dist/` pour le déploiement (ADR-0006). |
| Temps réel | `realtime` | Canal Socket.IO par lequel le serveur signale un changement (file, état d'une commande) ; l'écran relit alors la ressource par l'API. |
| Tableau de bord | `dashboard` | Indicateurs du boss et du responsable. |
| TVA | `vat` | Taxe optionnelle. |
| Ariary | `MGA` | Devise (code ISO 4217). Les montants s'affichent avec le sigle « MGA » (`1 250 000,00 MGA`) ; « Ariary » en toutes lettres ; jamais « Ar » (RG-FMT-01). |
| Fin de journée | `day_end_time` | Heure paramétrable à laquelle expirent les réservations non payées et les codes de remise. |
| Admin | rôle `admin` | Comptes, paramètres, corrections assistées, sauvegardes. |
| Responsable | rôle `manager` | Import, files, ajustements, validations ; voit les plafonds de remise sans les changer. |
| Commercial | rôle `sales` | Devis et commandes sur tablette. |
| Caissier | rôle `cashier` | Contrôle, paiement, facture, session de caisse. |
| Magasinier | rôle `warehouse` | Préparation et remise de la marchandise. |
| Boss | rôle `owner` | Tableau de bord et rapports à distance ; accorde les remises exceptionnelles (codes), fixe les plafonds de remise, la durée de réservation et les articles à promouvoir ; tout le reste en lecture. |
