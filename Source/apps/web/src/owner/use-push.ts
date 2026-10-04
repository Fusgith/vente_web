import { ERROR_LABELS } from '@vente-web/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client.js';
import { errorMessage } from '../api/error-message.js';
import { pushApi } from '../api/push.js';
import { labels } from '../labels.js';
import { useStatusLine } from '../shell/status-line.js';
import { keyBytes, pushRegistration, pushSupport, sameKey } from './push-device.js';

const text = labels.push;

/**
 * `unknown`: not read yet, or the shop server unreachable at the opening — nothing to show.
 * `install`: an iPhone or an iPad, the app not opened from the home screen.
 */
export type PushState =
  'unknown' | 'unsupported' | 'install' | 'unconfigured' | 'denied' | 'off' | 'on';
export type PushBusy = 'enable' | 'disable' | 'test' | null;

interface Device {
  registration: ServiceWorkerRegistration;
  key: Uint8Array<ArrayBuffer>;
}

/** The server's code says why; the browser's own refusal (offline, push service down) too. */
const failureOf = (error: unknown) =>
  error instanceof ApiError ? errorMessage(error) : text.failed;

/**
 * The owner's notifications on this device (T-033e, RG-DSH-05, H54, H55): read at the opening —
 * an active subscription is sent again so the server keeps it —, turned on within the tap
 * (browsers ask the permission only then), turned off, tested. Signing out leaves them on: the
 * owner turns them off here.
 */
export function usePushNotifications() {
  const { say } = useStatusLine();
  const [state, setState] = useState<PushState>('unknown');
  const [busy, setBusy] = useState<PushBusy>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const device = useRef<Device | null>(null);

  useEffect(() => {
    let live = true;
    const settle = (next: PushState) => {
      if (live) setState(next);
    };
    async function read(): Promise<PushState> {
      const support = pushSupport();
      if (support !== 'supported') return support;
      const key = await pushApi.key();
      if (!key) return 'unconfigured';
      const registration = await pushRegistration();
      if (!registration) return 'unsupported';
      device.current = { registration, key: keyBytes(key) };
      if (Notification.permission === 'denied') return 'denied';
      const current = await registration.pushManager.getSubscription();
      if (!current || Notification.permission !== 'granted') return 'off';
      if (!sameKey(current, device.current.key)) {
        // The shop's keys were renewed: this subscription receives nothing any more.
        await pushApi.remove(current.endpoint).catch(() => undefined);
        await current.unsubscribe();
        return 'off';
      }
      await pushApi.save(current.toJSON());
      return 'on';
    }
    read().then(settle, (error: unknown) => {
      // The shop server unreachable: nothing to say yet. Known, the device can be turned on again.
      if (!live || !device.current) return;
      setState('off');
      setFailure(failureOf(error));
    });
    return () => {
      live = false;
    };
  }, []);

  /** Within the tap: the permission asked first, nothing awaited before. */
  const enable = useCallback(async () => {
    const known = device.current;
    if (!known) return;
    setBusy('enable');
    setFailure(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setState('denied');
        say(text.refused);
      }
      if (permission !== 'granted') return;
      const subscription = await known.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: known.key,
      });
      try {
        await pushApi.save(subscription.toJSON());
      } catch (error) {
        // Refused or unreachable: the device stays off on both sides.
        await subscription.unsubscribe().catch(() => undefined);
        throw error;
      }
      setState('on');
      say(text.enabled, 'check');
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setBusy(null);
    }
  }, [say]);

  const disable = useCallback(async () => {
    const known = device.current;
    if (!known) return;
    setBusy('disable');
    setFailure(null);
    try {
      const subscription = await known.registration.pushManager.getSubscription();
      if (subscription) {
        // The server forgets it first; unreachable, it will once the push service says gone.
        await pushApi.remove(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState('off');
      say(text.disabled, 'check');
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setBusy(null);
    }
  }, [say]);

  const test = useCallback(async () => {
    const known = device.current;
    if (!known) return;
    setBusy('test');
    setFailure(null);
    const subscription = await known.registration.pushManager.getSubscription().catch(() => null);
    try {
      if (!subscription) {
        setState('off');
        setFailure(ERROR_LABELS.PUSH_SUBSCRIPTION_UNKNOWN);
        return;
      }
      await pushApi.test(subscription.endpoint);
      say(text.testSent, 'check');
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      // The push service forgot it: the browser's copy is useless, turned on again afresh.
      if (code === 'PUSH_SUBSCRIPTION_GONE') await subscription?.unsubscribe().catch(() => false);
      if (code === 'PUSH_SUBSCRIPTION_GONE' || code === 'PUSH_SUBSCRIPTION_UNKNOWN')
        setState('off');
      setFailure(failureOf(error));
    } finally {
      setBusy(null);
    }
  }, [say]);

  return { state, busy, failure, enable, disable, test };
}
