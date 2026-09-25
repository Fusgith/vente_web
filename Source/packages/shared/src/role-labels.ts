import type { Role } from './auth.js';

/** French names of the fixed roles (glossaire, ADR-0004), for screens, PDFs and exports. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  manager: 'Responsable',
  sales: 'Commercial',
  cashier: 'Caissier',
  warehouse: 'Magasinier',
  owner: 'Boss',
};
