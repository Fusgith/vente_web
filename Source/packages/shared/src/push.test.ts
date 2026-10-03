import { describe, expect, it } from 'vitest';

import { isKnownPushService, pushMessageSchema, pushSubscriptionSchema } from './push.js';

describe('the push services the shop server posts to (T-033e)', () => {
  it('are those of the browsers, by https on their own port', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGm1',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ])
      expect(isKnownPushService(endpoint), endpoint).toBe(true);
  });

  it('never another address: a look-alike, a port, credentials, an IP, plain http', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com.example.com/send',
      'https://evilfcm.googleapis.com/send',
      'https://push.services.mozilla.com.example.com/x',
      'https://fcm.googleapis.com:8443/send',
      'https://user:pw@fcm.googleapis.com/send',
      'https://127.0.0.1/send',
      'http://fcm.googleapis.com/send',
      'https://fcm.googleapis.com',
    ])
      expect(isKnownPushService(endpoint), endpoint).toBe(false);
  });
});

describe('a device subscription', () => {
  const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };

  it('takes the keys with or without padding, and nothing else', () => {
    const parsed = pushSubscriptionSchema.parse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      expirationTime: null,
      keys: { p256dh: `${keys.p256dh}=`, auth: `${keys.auth}==` },
    });
    expect(parsed).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys });
  });

  it('refuses keys of the wrong size and an endpoint too long', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
    for (const wrong of [
      { endpoint, keys: { ...keys, p256dh: 'B'.repeat(86) } },
      { endpoint, keys: { ...keys, auth: 'a+b/'.repeat(5) + 'ab' } },
      { endpoint: `${endpoint}/${'x'.repeat(2048)}`, keys },
    ])
      expect(pushSubscriptionSchema.safeParse(wrong).success).toBe(false);
  });

  it('a notification opens a page of the app itself', () => {
    const message = { title: 'T', body: 'B', tag: 'x' };
    expect(pushMessageSchema.safeParse({ ...message, url: '/' }).success).toBe(true);
    expect(pushMessageSchema.safeParse({ ...message, url: 'https://ailleurs.mg' }).success).toBe(
      false,
    );
  });
});
