import { ERROR_LABELS } from '@vente-web/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { labels } from '../labels.js';
import { Frame } from '../shell/Frame.js';
import { StatusLineProvider } from '../shell/StatusLineProvider.js';
import { apiError, fakeApi, ok } from '../test/fake-api.js';
import { PushSwitch } from './PushSwitch.js';

const text = labels.push;

/** A VAPID public key: an uncompressed P-256 point, 65 bytes, sent as base64url. */
const KEY_BYTES = Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index));
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const KEY = base64url(KEY_BYTES);
const OLD_KEY = Uint8Array.from(KEY_BYTES, (byte, index) => (index === 1 ? 99 : byte));

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/appareil-du-boss';
const SUBSCRIPTION = {
  endpoint: ENDPOINT,
  expirationTime: null,
  keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
};

const KEY_ROUTE = 'GET /push/key';
const SAVE = 'PUT /push/subscription';
const REMOVE = 'DELETE /push/subscription';
const TEST = 'POST /push/test';
const done = { status: 204 };

interface DeviceOptions {
  permission?: NotificationPermission;
  /** What the owner answers when the browser asks. */
  answer?: NotificationPermission;
  /** Already subscribed, with this key. */
  subscribedWith?: Uint8Array;
}

/** A browser that can receive notifications: its permission, its worker, its push manager. */
function fakeDevice({ permission = 'default', answer = 'granted', subscribedWith }: DeviceOptions) {
  const subscriptionWith = (key: Uint8Array) => {
    const subscription = {
      endpoint: ENDPOINT,
      options: { applicationServerKey: key.slice().buffer },
      toJSON: () => SUBSCRIPTION,
      unsubscribe: vi.fn(async () => {
        current = null;
        return true;
      }),
    };
    return subscription;
  };
  let current: ReturnType<typeof subscriptionWith> | null = subscribedWith
    ? subscriptionWith(subscribedWith)
    : null;
  const existing = current;
  const created = subscriptionWith(KEY_BYTES);
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async (_options: PushSubscriptionOptionsInit) => {
      current = created;
      return created;
    }),
  };
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = answer;
      return answer;
    }),
  };
  vi.stubGlobal('Notification', notification);
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  return { pushManager, notification, existing, created };
}

/** Shown once the device is read. */
async function mount(handlers: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(handlers);
  render(
    <StatusLineProvider>
      <Frame workspace="owner" name={labels.workspaces.owner.title}>
        <PushSwitch />
      </Frame>
    </StatusLineProvider>,
  );
  await screen.findByRole('group', { name: text.title });
  return api;
}

const zone = () => within(screen.getByRole('group', { name: text.title }));
const band = () => within(screen.getByRole('contentinfo')).getByRole('status');

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'userAgent');
});

describe('PushSwitch — the owner’s notifications on this device (T-033e, RG-DSH-05, H54)', () => {
  it('says so when the browser cannot receive them, without asking the server', async () => {
    const api = await mount({});

    expect(await zone().findByText(text.unsupported)).toBeInTheDocument();
    expect(zone().queryByRole('button')).not.toBeInTheDocument();
    expect(api.calls).toEqual([]);
  });

  it('on an iPhone, tells to add the app to the home screen first', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    await mount({});

    expect(await zone().findByText(text.install)).toBeInTheDocument();
  });

  it('says the shop has not set them up', async () => {
    fakeDevice({});
    await mount({ [KEY_ROUTE]: ok({ publicKey: null }) });
    expect(await zone().findByText(ERROR_LABELS.PUSH_NOT_CONFIGURED)).toBeInTheDocument();
  });

  it('says they are blocked in the browser’s settings', async () => {
    fakeDevice({ permission: 'denied' });
    await mount({ [KEY_ROUTE]: ok({ publicKey: KEY }) });
    expect(await zone().findByText(text.denied)).toBeInTheDocument();
    expect(zone().queryByRole('button')).not.toBeInTheDocument();
  });

  it('on an iPhone, sends to the system’s settings to unblock them', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    fakeDevice({ permission: 'denied' });
    await mount({ [KEY_ROUTE]: ok({ publicKey: KEY }) });
    expect(await zone().findByText(text.deniedApple)).toBeInTheDocument();
  });

  it('turns them on: the permission asked, the device subscribed with the shop’s key and sent', async () => {
    const device = fakeDevice({});
    const api = await mount({ [KEY_ROUTE]: ok({ publicKey: KEY }), [SAVE]: done });

    fireEvent.click(await zone().findByRole('button', { name: text.enable }));

    expect(await zone().findByText(text.on)).toBeInTheDocument();
    expect(device.notification.requestPermission).toHaveBeenCalledOnce();
    const options = device.pushManager.subscribe.mock.calls[0]?.[0];
    expect(options?.userVisibleOnly).toBe(true);
    expect(options?.applicationServerKey).toEqual(KEY_BYTES);
    expect(api.callsTo(SAVE).map((call) => call.body)).toEqual([SUBSCRIPTION]);
    expect(band()).toHaveTextContent(text.enabled);
    // The button pressed is gone: the focus goes to the test.
    expect(zone().getByRole('button', { name: text.test })).toHaveFocus();
  });

  it('stays off when the owner refuses in the browser’s question', async () => {
    const device = fakeDevice({ answer: 'denied' });
    await mount({ [KEY_ROUTE]: ok({ publicKey: KEY }) });

    fireEvent.click(await zone().findByRole('button', { name: text.enable }));

    expect(await zone().findByText(text.denied)).toHaveFocus();
    expect(band()).toHaveTextContent(text.refused);
    expect(device.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('a device the server refuses is unsubscribed again, and the reason said', async () => {
    const device = fakeDevice({});
    await mount({
      [KEY_ROUTE]: ok({ publicKey: KEY }),
      [SAVE]: apiError(422, 'PUSH_SERVICE_REFUSED'),
    });

    fireEvent.click(await zone().findByRole('button', { name: text.enable }));

    expect(await zone().findByRole('alert')).toHaveTextContent(ERROR_LABELS.PUSH_SERVICE_REFUSED);
    expect(device.created.unsubscribe).toHaveBeenCalledOnce();
    expect(zone().getByRole('button', { name: text.enable })).toBeEnabled();
  });

  it('on at the opening: sent again, tested, then turned off', async () => {
    const device = fakeDevice({ permission: 'granted', subscribedWith: KEY_BYTES });
    const api = await mount({
      [KEY_ROUTE]: ok({ publicKey: KEY }),
      [SAVE]: done,
      [TEST]: done,
      [REMOVE]: done,
    });

    expect(await zone().findByText(text.on)).toBeInTheDocument();
    expect(api.callsTo(SAVE)).toHaveLength(1);

    fireEvent.click(zone().getByRole('button', { name: text.test }));
    await waitFor(() => expect(band()).toHaveTextContent(text.testSent));
    expect(api.callsTo(TEST).map((call) => call.body)).toEqual([{ endpoint: ENDPOINT }]);

    fireEvent.click(zone().getByRole('button', { name: text.disable }));
    expect(await zone().findByText(text.off)).toBeInTheDocument();
    expect(api.callsTo(REMOVE).map((call) => call.body)).toEqual([{ endpoint: ENDPOINT }]);
    expect(device.existing?.unsubscribe).toHaveBeenCalledOnce();
    expect(band()).toHaveTextContent(text.disabled);
    expect(zone().getByRole('button', { name: text.enable })).toHaveFocus();
  });

  it('a subscription made with the shop’s former key is dropped at the opening', async () => {
    const device = fakeDevice({ permission: 'granted', subscribedWith: OLD_KEY });
    const api = await mount({ [KEY_ROUTE]: ok({ publicKey: KEY }), [REMOVE]: done });

    expect(await zone().findByText(text.off)).toBeInTheDocument();
    expect(device.existing?.unsubscribe).toHaveBeenCalledOnce();
    expect(api.callsTo(REMOVE)).toHaveLength(1);
    expect(api.callsTo(SAVE)).toEqual([]);
  });

  it('a test the push service says gone turns the device off', async () => {
    const device = fakeDevice({ permission: 'granted', subscribedWith: KEY_BYTES });
    await mount({
      [KEY_ROUTE]: ok({ publicKey: KEY }),
      [SAVE]: done,
      [TEST]: apiError(410, 'PUSH_SUBSCRIPTION_GONE'),
    });

    fireEvent.click(await zone().findByRole('button', { name: text.test }));

    expect(await zone().findByRole('alert')).toHaveTextContent(ERROR_LABELS.PUSH_SUBSCRIPTION_GONE);
    expect(zone().getByText(text.off)).toBeInTheDocument();
    expect(device.existing?.unsubscribe).toHaveBeenCalledOnce();
  });
});
