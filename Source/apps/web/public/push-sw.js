/*
 * The owner's notifications (T-033e, RG-DSH-05, H54, H55), loaded by the generated service
 * worker (`workbox.importScripts`): shown even with the app closed, a tap opens the app. A classic
 * script, served as is from `public/`: no build step, no import.
 */

/** When the message cannot be read: still shown, a push never goes unseen (Safari stops them). */
const FALLBACK = {
  title: 'Demande de remise',
  body: 'Une demande de remise attend votre réponse.',
  tag: 'discount-request',
  url: '/',
};

/** The message the server composed, its missing parts from the fallback. */
function messageOf(data) {
  let message = {};
  try {
    message = data ? data.json() : {};
  } catch {
    // Not JSON: the fallback says enough.
  }
  const text = (value, fallback) => (typeof value === 'string' && value ? value : fallback);
  return {
    title: text(message.title, FALLBACK.title),
    body: text(message.body, FALLBACK.body),
    tag: text(message.tag, FALLBACK.tag),
    url: text(message.url, FALLBACK.url),
  };
}

/** A page of the app itself: a notification never opens another site. */
function appUrl(url) {
  const target = new URL(url, self.location.origin);
  return target.origin === self.location.origin ? target.href : `${self.location.origin}/`;
}

self.addEventListener('push', (event) => {
  const message = messageOf(event.data);
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      // One per request: told again, it replaces the first rather than piling up.
      tag: message.tag,
      lang: 'fr',
      icon: '/icons/icon.svg',
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = appUrl(event.notification.data?.url ?? '/');
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      // The app already open shows the requests as they come (realtime): brought to the front.
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
