import type { Role } from '@vente-web/shared';

/**
 * Annexe B of the business CDC, the one place the API writes its rights (T-013): a route names
 * the right it needs, never a list of roles; what is limited to one's own records ("siens") is
 * checked by the service.
 */
export const PERMISSIONS = {
  // Articles et unités de vente, grille de prix (H65) ; historique des prix.
  'products.read': ['manager', 'owner', 'admin'],
  'products.edit': ['manager', 'owner'],
  // Plafonds de remise.
  'discountCaps.read': ['sales', 'cashier', 'manager', 'owner', 'admin'],
  'discountCaps.edit': ['owner'],
  // Articles à promouvoir (RG-DEV-06): the others see them in the catalogue.
  promotions: ['owner'],
  // Import articles (RG-IMP-08).
  imports: ['manager', 'admin'],
  // Ajustement de stock ; the stock alerts.
  'stock.adjust': ['manager', 'admin'],
  'stock.alerts': ['manager', 'owner'],
  // Clients : created by the salesperson; category, deactivation and merge by the manager.
  'customers.read': ['sales', 'cashier', 'manager', 'owner', 'admin'],
  'customers.create': ['sales'],
  'customers.edit': ['sales', 'cashier', 'manager'],
  'customers.manage': ['manager'],
  // Type d'un client (H66).
  'customers.type': ['manager', 'owner'],
  // Règles de remise (H62).
  'discountRules.read': ['sales', 'cashier', 'manager', 'owner', 'admin'],
  'discountRules.edit': ['owner'],
  // Conditions de crédit, créances et titres (H67, H68).
  'credit.read': ['cashier', 'manager', 'owner', 'admin'],
  'credit.conditions': ['owner'],
  'credit.settle': ['cashier', 'manager'],
  'credit.instruments': ['manager'],
  // Durée de réservation (RG-STK-02, H45).
  'reservationDays.read': ['manager', 'owner', 'admin'],
  'reservationDays.edit': ['owner', 'admin'],
  // Devis.
  'quotes.read': ['sales', 'cashier', 'manager', 'owner', 'admin'],
  'quotes.create': ['sales'],
  'quotes.edit': ['sales', 'manager'],
  // Commande : valider ; modifier à la caisse ; annuler avant paiement.
  'orders.read': ['sales', 'cashier', 'warehouse', 'manager', 'owner', 'admin'],
  'orders.submit': ['sales', 'manager'],
  'orders.change': ['cashier', 'manager'],
  'orders.cancel': ['sales', 'cashier', 'manager'],
  // Remise dans le plafond et code promo, à la caisse (H61, H63).
  'orders.discount': ['cashier', 'manager'],
  // Remise exceptionnelle : demander ; accorder ou refuser (H64) ; codes promo (H63).
  'discountRequests.ask': ['sales', 'cashier', 'manager'],
  'discountRequests.reasons': ['sales', 'cashier', 'manager', 'owner'],
  'discountRequests.board': ['manager', 'owner'],
  'discountRequests.decide': ['owner'],
  discountCodes: ['owner'],
  // Paniers de la borne : voir ; prendre (RG-BOR-04/05).
  'kiosk.read': ['sales', 'manager', 'owner'],
  'kiosk.take': ['sales', 'manager'],
  // Files : appeler à la caisse ; réordonner, prioriser ; superviser.
  'queues.register': ['cashier', 'manager'],
  'queues.supervise': ['manager'],
  supervision: ['manager', 'owner'],
  // Paiement, facture ; annulation après paiement (avoir).
  payments: ['cashier', 'manager'],
  refunds: ['cashier', 'manager'],
  'refunds.read': ['cashier', 'manager', 'owner'],
  // Livraison, anomalie.
  deliveries: ['warehouse', 'manager'],
  'deliveries.supervise': ['manager'],
  // Session de caisse.
  register: ['cashier', 'manager'],
  'register.read': ['cashier', 'manager', 'owner', 'admin'],
  'register.list': ['manager', 'owner', 'admin'],
  // Tableau de bord.
  dashboard: ['manager', 'owner', 'admin'],
  // Exports (the cashier's own closings, the admin's audit: by the service).
  exports: ['cashier', 'manager', 'owner', 'admin'],
  // Journal d'audit.
  'audit.read': ['manager', 'owner', 'admin'],
  // Comptes, rôles, mots de passe, postes.
  accounts: ['admin'],
  // Paramètres (CDC métier §13): the owner sets the general cap and the reservation duration.
  'settings.read': ['manager', 'owner', 'admin'],
  'settings.edit': ['admin'],
  // The owner's notifications (H55).
  push: ['owner'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (role: Role, permission: Permission): boolean =>
  (PERMISSIONS[permission] as readonly Role[]).includes(role);
