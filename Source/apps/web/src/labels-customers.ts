/** The manager's customer directory (T-029b, RG-DEV-04, H49 a); `labels.customers`. */
export const customersLabels = {
  title: 'Clients',
  search: 'Nom ou téléphone',
  category: 'Catégorie',
  allCategories: 'Toutes',
  show: 'Afficher',
  name: 'Nom',
  phone: 'Téléphone',
  none: 'Aucun client ne correspond.',
  refine: 'Précisez la recherche : seuls les 8 premiers clients sont affichés.',
  /** The category field of one row. */
  categoryOf: (name: string) => `Catégorie de ${name}`,
};
