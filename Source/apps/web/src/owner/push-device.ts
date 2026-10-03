/**
 * The browser's side of the owner's notifications (T-033e): whether this device can receive
 * them, its service worker, its subscription. No React here: `usePushNotifications` drives it.
 */

/** How long the service worker is awaited: none in development, or not yet installed. */
const READY_MS = 5000;

export type PushSupport = 'supported' | 'install' | 'unsupported';

/** An iPhone or an iPad (iPadOS says Macintosh, with a touch screen). */
export const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

const standalone = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(display-mode: standalone)').matches;

/**
 * Can this browser receive them? On an iPhone or an iPad, only once the app is on the home screen
 * and opened from there (iOS 16.4): `install` says so.
 */
export function pushSupport(): PushSupport {
  const able =
    'serviceWorker' in navigator &&
    typeof PushManager !== 'undefined' &&
    typeof Notification !== 'undefined';
  if (able) return 'supported';
  return isApple() && !standalone() ? 'install' : 'unsupported';
}

/** The app's service worker, null when there is none to receive them. */
export async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READY_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The VAPID key as the browser takes it: bytes, not text (Safari). */
export function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Subscribed with this key? Another one (the server's keys renewed) receives nothing. */
export function sameKey(subscription: PushSubscription, key: Uint8Array<ArrayBuffer>): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current || current.byteLength !== key.byteLength) return false;
  const bytes = new Uint8Array(current);
  return bytes.every((byte, index) => byte === key[index]);
}
