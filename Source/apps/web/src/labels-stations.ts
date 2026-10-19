import type { StationType } from '@vente-web/shared';

/** The shop's stations and the pairing of devices (T-015, RG-USR-09, H71); `labels.stations`. */
export const stationsLabels = {
  title: 'Postes du magasin',
  help: 'Déclarez chaque tablette, caisse et comptoir de livraison, puis appairez chaque appareil depuis l’appareil lui-même, connecté en admin. Dès qu’un appareil est appairé, tous les autres doivent l’être pour ouvrir une session de travail ; l’admin et le boss se connectent partout. Appairer à nouveau un poste remplace son appareil précédent.',
  types: {
    SALES: 'Tablette commerciale',
    REGISTER: 'Caisse',
    DELIVERY: 'Comptoir de livraison',
    DISPLAY: 'Écran public',
  } satisfies Record<StationType, string>,
  type: 'Type',
  name: 'Nom',
  active: 'Actif',
  pairing: 'Appareil',
  add: 'Ajouter le poste',
  empty: 'Aucun poste déclaré.',
  pair: 'Appairer cet appareil',
  pairedOn: (date: string) => `Appairé le ${date}`,
  unpaired: 'Aucun appareil',
  /** The display opens at its address, on the TV's browser, with no account. */
  displayLink: 'Adresse de l’écran',
  added: (name: string) => `Poste « ${name} » ajouté.`,
  saved: (name: string) => `Poste « ${name} » enregistré.`,
  paired: (name: string) => `Cet appareil est maintenant le poste « ${name} ».`,
  notKept:
    'Ce navigateur refuse de garder la clé (navigation privée ?) : l’appareil reste non appairé.',
};
