/**
 * The key this device got when the admin paired it to its station (T-015, RG-USR-09, H71),
 * sent at each login. Kept on the device only: pairing again replaces it.
 */
const STORAGE = 'vente-web.station-key';

export function readStationKey(): string | null {
  try {
    return localStorage.getItem(STORAGE);
  } catch {
    return null;
  }
}

/** False when the browser refuses to keep it (private window): the device stays unpaired. */
export function saveStationKey(key: string): boolean {
  try {
    localStorage.setItem(STORAGE, key);
    return true;
  } catch {
    return false;
  }
}
