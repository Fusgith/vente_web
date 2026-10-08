/** The salesperson's discounts, allowed or not by the admin (T-087, H60); `labels.salesDiscount`. */
export const salesDiscountLabels = {
  title: 'Remises du commercial',
  help: 'Le commercial n’annonce pas de remise : le client peut en demander une à la caisse, avant de payer. Cochée, la tablette du commercial lui permet aussi de remiser dans les plafonds et de demander une remise exceptionnelle au boss.',
  allow: 'Le commercial peut accorder des remises',
  saved: (enabled: boolean) =>
    enabled
      ? 'Le commercial peut accorder des remises.'
      : 'Le commercial n’accorde plus de remise.',
  /** On the tablet, when a quote taken up carried discounts the salesperson may no longer give. */
  removed: (number: string) =>
    `Devis ${number} repris sans ses remises : le commercial n’en accorde pas. Enregistrez-le puis validez.`,
};
