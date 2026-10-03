import { afterEach, describe, expect, it, vi } from 'vitest';

import { keyBytes, pushRegistration, pushSupport, sameKey } from './push-device.js';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'userAgent');
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
});

const withKey = (bytes: Uint8Array) =>
  ({ options: { applicationServerKey: bytes.slice().buffer } }) as unknown as PushSubscription;

describe('the device’s side of the notifications (T-033e)', () => {
  it('reads the key as bytes, padded or not', () => {
    expect(keyBytes('BAEC_-8')).toEqual(Uint8Array.from([4, 1, 2, 255, 239]));
    expect(keyBytes('BAEC_-8=')).toEqual(Uint8Array.from([4, 1, 2, 255, 239]));
  });

  it('compares the subscription’s key byte by byte', () => {
    const key = Uint8Array.from([4, 1, 2]);
    expect(sameKey(withKey(key), key)).toBe(true);
    expect(sameKey(withKey(Uint8Array.from([4, 1, 3])), key)).toBe(false);
    expect(sameKey(withKey(Uint8Array.from([4, 1])), key)).toBe(false);
    expect(sameKey({ options: { applicationServerKey: null } } as PushSubscription, key)).toBe(
      false,
    );
  });

  it('an iPad says Macintosh, with a touch screen', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    });
    expect(pushSupport()).toBe('unsupported');
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    expect(pushSupport()).toBe('install');
  });

  it('gives up on a service worker that never comes (development, not installed yet)', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: new Promise(() => undefined) },
    });

    const registration = pushRegistration();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(registration).resolves.toBeNull();
  });
});
