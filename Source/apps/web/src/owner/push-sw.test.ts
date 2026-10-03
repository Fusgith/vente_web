import { describe, expect, it, vi } from 'vitest';

import source from '../../public/push-sw.js?raw';

const ORIGIN = 'https://magasin.example.mg';

interface Shown {
  title: string;
  options: NotificationOptions;
}

/** The service worker's scope, faked: the script run in it, its events dispatched by hand. */
function workerScope(windows: { url: string }[] = []) {
  const listeners = new Map<string, (event: object) => void>();
  const shown: Shown[] = [];
  const open = windows.map((window) => ({ ...window, focus: vi.fn(async () => undefined) }));
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: object) => void) =>
      listeners.set(type, listener),
    registration: {
      showNotification: vi.fn(async (title: string, options: NotificationOptions) => {
        shown.push({ title, options });
      }),
    },
    clients: {
      matchAll: vi.fn(async () => open),
      openWindow: vi.fn(async () => null),
    },
  };
  // The file as the browser runs it: a classic script whose global scope is `self`.
  new Function('self', source)(scope);

  async function dispatch(type: string, event: object) {
    let work: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => (work = promise) });
    await work;
  }
  return { scope, shown, open, dispatch };
}

const pushed = (data: unknown) => ({ data: { json: () => data } });

describe('the push service worker (T-033e, RG-DSH-05)', () => {
  it('shows the message the server composed, one per request', async () => {
    const worker = workerScope();

    await worker.dispatch(
      'push',
      pushed({
        title: 'Demande de remise : Rasoa Hanta',
        body: 'SAV-001 Savon : 20 %',
        tag: 'discount-request:42',
        url: '/',
      }),
    );

    expect(worker.shown).toEqual([
      {
        title: 'Demande de remise : Rasoa Hanta',
        options: {
          body: 'SAV-001 Savon : 20 %',
          tag: 'discount-request:42',
          lang: 'fr',
          icon: '/icons/icon.svg',
          data: { url: '/' },
        },
      },
    ]);
  });

  it('still shows something when the message cannot be read', async () => {
    const worker = workerScope();
    const unreadable = {
      data: {
        json: () => {
          throw new SyntaxError('not JSON');
        },
      },
    };

    await worker.dispatch('push', unreadable);
    await worker.dispatch('push', { data: null });
    await worker.dispatch('push', pushed({ title: '', body: 42 }));

    expect(worker.shown.map(({ title, options }) => [title, options.body])).toEqual(
      Array(3).fill(['Demande de remise', 'Une demande de remise attend votre réponse.']),
    );
  });

  it('a tap brings the app to the front, or opens it', async () => {
    const close = vi.fn();
    const notification = (url: string) => ({ notification: { close, data: { url } } });
    const running = workerScope([{ url: 'https://ailleurs.mg/' }, { url: `${ORIGIN}/` }]);

    await running.dispatch('notificationclick', notification('/'));

    expect(close).toHaveBeenCalled();
    expect(running.open[0]?.focus).not.toHaveBeenCalled();
    expect(running.open[1]?.focus).toHaveBeenCalled();
    expect(running.scope.clients.openWindow).not.toHaveBeenCalled();

    const closed = workerScope();
    await closed.dispatch('notificationclick', notification('/'));
    // Never another site, whatever the message said.
    await closed.dispatch('notificationclick', notification('https://ailleurs.mg/piege'));
    expect(closed.scope.clients.openWindow.mock.calls).toEqual([[`${ORIGIN}/`], [`${ORIGIN}/`]]);
  });
});
