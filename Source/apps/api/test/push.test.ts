import { randomBytes, randomUUID } from 'node:crypto';

import {
  formatMga,
  orderSchema,
  pushKeySchema,
  pushMessageSchema,
  type Order,
  type PushMessage,
} from '@vente-web/shared';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ttlUntil, type PushOptions, type PushSend } from '../src/plugins/push.js';
import { requestMessage } from '../src/services/push-message.js';
import { MAX_DEVICES } from '../src/services/push.js';
import { TEST_DATABASE_URL } from './db.js';
import { discountScene, type DiscountScene } from './discount-scene.js';
import {
  auditActions,
  auditEntries,
  createTestApp,
  createUser,
  loginOk,
  request,
  type TestApp,
} from './helpers.js';

const PASSWORD = 'Boss-1234!';

interface Sent {
  endpoint: string;
  message: PushMessage;
  options: PushOptions;
}

/** A fake push service: what it was given, and the devices it refuses (status or network). */
function fakePushService() {
  const sent: Sent[] = [];
  const refusals = new Map<string, number | Error>();
  const send: PushSend = async (target, payload, options) => {
    const refusal = refusals.get(target.endpoint);
    if (typeof refusal === 'number') {
      throw Object.assign(new Error('refused'), { statusCode: refusal, endpoint: target.endpoint });
    }
    if (refusal) throw refusal;
    sent.push({
      endpoint: target.endpoint,
      message: pushMessageSchema.parse(JSON.parse(payload)),
      options,
    });
  };
  return { sent, refusals, send };
}

/** A device as its browser describes it: a Chrome endpoint and the payload's keys. */
const device = (endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`) => ({
  endpoint,
  expirationTime: null,
  keys: {
    p256dh: webpush.generateVAPIDKeys().publicKey,
    auth: randomBytes(16).toString('base64url'),
  },
});

describe('the notification kept until the request expires (T-033e)', () => {
  const now = Date.parse('2026-10-03T14:00:00Z');

  it('lasts until the end of the shop day, a minute at least, a day at most', () => {
    expect(ttlUntil('2026-10-03T15:00:00Z', now)).toBe(3600);
    expect(ttlUntil('2026-10-03T13:00:00Z', now)).toBe(60);
    expect(ttlUntil('2026-10-06T14:00:00Z', now)).toBe(86_400);
  });
});

describe.skipIf(!TEST_DATABASE_URL)(
  "push notifications to the owner's phone (RG-DSH-05, H54, ⚠️ H55)",
  () => {
    const vapid = webpush.generateVAPIDKeys();
    const service = fakePushService();
    let t: TestApp;
    let s: DiscountScene;

    beforeAll(async () => {
      t = await createTestApp(
        {
          VAPID_PUBLIC_KEY: vapid.publicKey,
          VAPID_PRIVATE_KEY: vapid.privateKey,
          VAPID_SUBJECT: 'mailto:boss@example.mg',
        },
        { captureLogs: true, push: service.send },
      );
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      s = await discountScene(t);
      service.sent.length = 0;
      service.refusals.clear();
    });

    const call = (
      method: 'GET' | 'PUT' | 'DELETE' | 'POST',
      url: string,
      cookie: string,
      body?: unknown,
    ) => request(t.app, method, `/api/v1${url}`, { cookie, ...(body ? { body } : {}) });
    const subscribe = async (cookie = s.cookies.owner, subscription = device()) => {
      const reply = await call('PUT', '/push/subscription', cookie, subscription);
      expect(reply.statusCode, reply.body).toBe(204);
      return subscription;
    };
    const refused = (
      reply: { statusCode: number; body: string; json: () => unknown },
      status: number,
      code: string,
    ) => {
      expect(reply.statusCode, reply.body).toBe(status);
      expect(reply.json()).toMatchObject({ code });
    };
    const rows = () =>
      t.db.pushSubscription.findMany({ orderBy: { createdAt: 'asc' }, include: { user: true } });

    /** Another owner, signed in. */
    async function owner(username: string): Promise<{ id: string; cookie: string }> {
      const { id } = await createUser(t.db, { username, roles: ['owner'], password: PASSWORD });
      const { cookie } = await loginOk(t.app, { username, role: 'owner', password: PASSWORD });
      return { id, cookie };
    }

    it('gives the key and keeps a device for the owner only; the device is seen again, then turned off', async () => {
      const key = await call('GET', '/push/key', s.cookies.owner);
      expect(pushKeySchema.parse(key.json())).toEqual({ publicKey: vapid.publicKey });
      refused(await call('GET', '/push/key', s.cookies.manager), 403, 'AUTH_FORBIDDEN');
      refused(
        await call('PUT', '/push/subscription', s.cookies.sales, device()),
        403,
        'AUTH_FORBIDDEN',
      );

      const phone = await subscribe();
      // The browser renewed its keys: the same device, nothing more to audit.
      const renewed = { ...device(phone.endpoint) };
      await subscribe(s.cookies.owner, renewed);
      const [saved, ...others] = await rows();
      expect(others).toEqual([]);
      expect(saved).toMatchObject({ user: { username: 'boss' }, p256dh: renewed.keys.p256dh });

      const off = await call('DELETE', '/push/subscription', s.cookies.owner, {
        endpoint: phone.endpoint,
      });
      expect(off.statusCode, off.body).toBe(204);
      const again = await call('DELETE', '/push/subscription', s.cookies.owner, {
        endpoint: phone.endpoint,
      });
      expect(again.statusCode, again.body).toBe(204);
      expect(await rows()).toEqual([]);
      expect(await auditActions(t.db, saved?.id)).toEqual([
        'push_subscription.created',
        'push_subscription.deleted',
      ]);
      // The endpoint lets anyone write to the phone: never in the audit log.
      const audit = JSON.stringify(await t.db.auditLog.findMany());
      expect(audit).not.toContain(phone.endpoint);
      expect(audit).not.toContain(renewed.keys.auth);
    });

    it('keeps only the push services of the browsers, by https on their own port', async () => {
      for (const endpoint of [
        'https://push.example.com/send/1',
        'https://fcm.googleapis.com.example.com/send/1',
        'https://fcm.googleapis.com:8443/send/1',
        'https://user@fcm.googleapis.com/send/1',
        'https://127.0.0.1/send/1',
      ]) {
        const reply = await call('PUT', '/push/subscription', s.cookies.owner, device(endpoint));
        refused(reply, 422, 'PUSH_SERVICE_REFUSED');
      }
      for (const subscription of [
        device('http://fcm.googleapis.com/fcm/send/1'),
        { ...device(), keys: { p256dh: 'short', auth: randomBytes(16).toString('base64url') } },
        { endpoint: device().endpoint },
      ]) {
        const reply = await call('PUT', '/push/subscription', s.cookies.owner, subscription);
        refused(reply, 400, 'VALIDATION_ERROR');
      }
      // Firefox, Safari and Edge are welcome.
      for (const endpoint of [
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://web.push.apple.com/QGm1',
        'https://wns2-par02p.notify.windows.com/w/?token=abc',
      ])
        await subscribe(s.cookies.owner, device(endpoint));
      expect(await rows()).toHaveLength(3);
    });

    it(`keeps ${MAX_DEVICES} devices per owner: the one seen least recently stops`, async () => {
      const devices = [];
      for (let i = 0; i <= MAX_DEVICES; i++) devices.push(await subscribe());

      const kept = await rows();
      expect(kept).toHaveLength(MAX_DEVICES);
      expect(kept.map((row) => row.endpoint)).not.toContain(devices[0]?.endpoint);
      expect((await auditEntries(t.db)).at(-1)).toEqual(['push_subscription.deleted', 'limit']);
    });

    it('a phone changing hands tells its new owner', async () => {
      const phone = await subscribe();
      const other = await owner('boss2');

      await subscribe(other.cookie, device(phone.endpoint));

      const [moved, ...others] = await rows();
      expect(others).toEqual([]);
      expect(moved?.userId).toBe(other.id);
      const changes = await t.db.auditLog.findMany({ where: { entityId: moved?.id ?? 'none' } });
      expect(changes.map(({ action, before, after }) => ({ action, before, after }))).toEqual([
        {
          action: 'push_subscription.created',
          before: null,
          after: { userId: expect.any(String) },
        },
        {
          action: 'push_subscription.created',
          before: { userId: changes[0]?.userId },
          after: { userId: other.id },
        },
      ]);
    });

    it("tells each active owner's device of a request, in French, until it expires", async () => {
      const phone = await subscribe();
      const tablet = await subscribe();
      const gone = await owner('ancien');
      await subscribe(gone.cookie);
      await t.db.user.update({ where: { id: gone.id }, data: { isActive: false } });
      const demoted = await owner('ex-boss');
      await subscribe(demoted.cookie);
      await t.db.user.update({ where: { id: demoted.id }, data: { roles: ['manager'] } });

      const before = Date.now();
      const order = await s.asked(await s.quote(), [
        [null, 'amount', '5000'],
        [s.products.soap, 'pct', '20'],
      ]);
      await t.app.push.flush();

      const request = order.discountRequest;
      expect(service.sent.map((sent) => sent.endpoint).sort()).toEqual(
        [phone.endpoint, tablet.endpoint].sort(),
      );
      expect(service.sent[0]?.message).toEqual({
        title: 'Demande de remise : Rasoa Hanta',
        body: [
          'Remise sur SAV-001 Savon de Marseille 200 g : 20 %',
          `Remise sur le total : ${formatMga('5000')}`,
          `Commande de ${formatMga(order.total)}`,
          'Motif : Client fidèle',
          `Demandée par ${request?.requestedBy.fullName}`,
        ].join('\n'),
        tag: `discount-request:${request?.id}`,
        url: '/',
      });
      // Undelivered, it is replaced by a newer one of the same request, and dropped at expiry.
      const { options } = service.sent[0] ?? {};
      expect(options?.topic).toBe(request?.id.replaceAll('-', ''));
      expect(options?.topic).toHaveLength(32);
      // Counted when sent, between the request's start and now (whole seconds).
      const expiresAt = request?.expiresAt ?? '';
      expect(options?.ttl).toBeLessThanOrEqual(ttlUntil(expiresAt, before));
      expect(options?.ttl).toBeGreaterThanOrEqual(ttlUntil(expiresAt));
    });

    it('forgets a device its push service says is gone; a failure does not stop the request', async () => {
      const removed = await subscribe();
      const offline = await subscribe();
      const kept = await subscribe();
      service.refusals.set(removed.endpoint, 410);
      service.refusals.set(
        offline.endpoint,
        Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }),
      );

      const reply = await s.ask(await s.quote(), [[s.products.soap, 'pct', '20']]);
      expect(reply.statusCode, reply.body).toBe(201);
      await t.app.push.flush();

      expect(service.sent.map((sent) => sent.endpoint)).toEqual([kept.endpoint]);
      expect((await rows()).map((row) => row.endpoint).sort()).toEqual(
        [offline.endpoint, kept.endpoint].sort(),
      );
      const forgotten = await t.db.auditLog.findFirst({ where: { reason: 'gone' } });
      expect(forgotten).toMatchObject({ action: 'push_subscription.deleted', userId: null });
      // A device's address never reaches the logs.
      const logs = JSON.stringify(t.logs);
      expect(logs).toContain('push notification failed');
      expect(logs).toContain('ENOTFOUND');
      for (const { endpoint } of [removed, offline, kept]) expect(logs).not.toContain(endpoint);
    });

    it('sends a test to the owner’s own device, and says why it did not go', async () => {
      const phone = await subscribe();
      const test = (endpoint: string, cookie = s.cookies.owner) =>
        call('POST', '/push/test', cookie, { endpoint });

      const sent = await test(phone.endpoint);
      expect(sent.statusCode, sent.body).toBe(204);
      expect(service.sent).toEqual([
        {
          endpoint: phone.endpoint,
          message: {
            title: 'Notifications activées',
            body: 'Les demandes de remise arriveront ici, même application fermée.',
            tag: 'push-test',
            url: '/',
          },
          options: { ttl: 60 },
        },
      ]);
      refused(await test(device().endpoint), 404, 'PUSH_SUBSCRIPTION_UNKNOWN');
      // Another owner's device is not this one's to test.
      const other = await owner('boss2');
      refused(await test(phone.endpoint, other.cookie), 404, 'PUSH_SUBSCRIPTION_UNKNOWN');
      service.refusals.set(phone.endpoint, 500);
      refused(await test(phone.endpoint), 502, 'PUSH_SEND_FAILED');
      service.refusals.set(phone.endpoint, 404);
      refused(await test(phone.endpoint), 410, 'PUSH_SUBSCRIPTION_GONE');
      expect(await rows()).toEqual([]);
      // Each test goes out to the Internet: a few a minute.
      refused(await test(phone.endpoint), 429, 'RATE_LIMITED');
    });

    it('shows three elements of a long request, counts the others', async () => {
      const order = await s.asked(await s.quote(), [
        [null, 'amount', '5000'],
        [s.products.soap, 'pct', '20'],
        [s.products.nails, 'pct', '30'],
      ]);
      const request = order.discountRequest;
      if (!request) throw new Error('the order has no request');
      const long: Order = orderSchema.parse({
        ...order,
        discountRequest: { ...request, items: [...request.items, ...request.items] },
      });

      const lines = requestMessage(long)?.body.split('\n');

      expect(lines?.slice(0, 4)).toEqual([
        'Remise sur CLO-001 Clous 5 cm : 30 %',
        'Remise sur SAV-001 Savon de Marseille 200 g : 20 %',
        `Remise sur le total : ${formatMga('5000')}`,
        'et 3 autres',
      ]);
      expect(requestMessage({ ...order, discountRequest: null })).toBeNull();
    });
  },
);

describe.skipIf(!TEST_DATABASE_URL)('push notifications not configured (T-033e)', () => {
  const service = fakePushService();
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({}, { push: service.send });
  });
  afterAll(() => t.close());

  it('say so, and a request is made as before', async () => {
    const s = await discountScene(t);
    const call = (method: 'GET' | 'PUT' | 'POST', url: string, body?: unknown) =>
      request(t.app, method, `/api/v1${url}`, {
        cookie: s.cookies.owner,
        ...(body ? { body } : {}),
      });

    expect((await call('GET', '/push/key')).json()).toEqual({ publicKey: null });
    const subscription = await call('PUT', '/push/subscription', device());
    expect(subscription.statusCode, subscription.body).toBe(503);
    expect(subscription.json()).toMatchObject({ code: 'PUSH_NOT_CONFIGURED' });
    const test = await call('POST', '/push/test', { endpoint: device().endpoint });
    expect(test.json()).toMatchObject({ code: 'PUSH_NOT_CONFIGURED' });

    await s.asked(await s.quote(), [[s.products.soap, 'pct', '20']]);
    await t.app.push.flush();
    expect(service.sent).toEqual([]);
  });
});
